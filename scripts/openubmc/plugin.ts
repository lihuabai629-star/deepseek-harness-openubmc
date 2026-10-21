/** Installable openUBMC bundle over the native DSH services. @module */
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isSea } from 'node:sea'
import type { Context } from '@deepseek-ai/cordis'
import { z as schema } from 'zod'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as mcp from '@deepseek-ai/dsh-mcp-client'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { load as parseYaml } from 'js-yaml'
import { installPortableRuntime } from './portable-runtime.ts'
import * as cases from '@deepseek-ai/dsh-experimental-openubmc-cases'
import type { Config } from './plugin-config.ts'

const payloadSchema = schema.object({
  skills: schema.array(schema.object({ name: schema.string().min(1), path: schema.string().min(1) })).min(1),
})
const frontmatterSchema = schema.object({ description: schema.string().min(1),
  'disable-model-invocation': schema.boolean().optional(), 'user-invocable': schema.boolean().optional() })

function parseSkill(raw: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match?.[1] === undefined) throw new Error('openUBMC Skill requires YAML frontmatter.')
  return { metadata: frontmatterSchema.parse(parseYaml(match[1])), content: raw.slice(match[0].length).trim() }
}

function resolveOptions(config: Config) {
  if (process.platform !== 'linux') throw new Error('openUBMC supports Linux and WSL hosts.')
  if (config.node === undefined && (isSea() || Object.hasOwn(process.versions, 'electron'))) {
    throw new Error('openUBMC needs a standalone Node executable in config.node for this host.')
  }
  const node = config.node ?? process.execPath
  if (!isAbsolute(node)) throw new Error('openUBMC config.node must be an absolute executable path.')
  const required = Math.max(config.operationDeadlineSeconds, config.observationDeadlineSeconds) * 1000 + config.completionGraceMs
  if (config.toolCallTimeoutMs < required) throw new Error(`openUBMC toolCallTimeoutMs must be at least ${required}.`)
  return { node, python: config.python, kbEnabled: config.kbEnabled, authorityLockWaitMs: config.authorityLockWaitMs,
    operationDeadlineSeconds: config.operationDeadlineSeconds, observationDeadlineSeconds: config.observationDeadlineSeconds,
    completionGraceMs: config.completionGraceMs, toolCallTimeoutMs: config.toolCallTimeoutMs,
    credentialsFile: resolve(config.credentialsFile ?? dshHomePath('credentials.env')),
    stateDir: resolve(config.stateDir ?? dshHomePath('openubmc-agent-state')) }
}

/**
 * Mount packaged workflows and the existing native adapters under one owned fiber.
 * @param ctx - Profile plugin context; disposal removes all child registrations.
 * @param config - Validated deployment configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const options = resolveOptions(config)
  const payload = fileURLToPath(new URL('../payload/', import.meta.url))
  const workflow = join(payload, 'workflow')
  const manifest = payloadSchema.parse(JSON.parse(await readFile(join(payload, 'skills.json'), 'utf8')))
  const candidates: SkillCandidate[] = await Promise.all(manifest.skills.map(async (skill) => {
    const directory = join(workflow, skill.path)
    const path = skill.name === 'openubmc-environment-setup' ? join(payload, 'environment-skill.md') : join(directory, 'SKILL.md')
    const { metadata } = parseSkill(await readFile(path, 'utf8'))
    return { name: skill.name, description: metadata.description, path, locator: path,
      source: 'bundled', provider: 'openubmc-packaged', rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory },
      invocation: { modelInvocable: metadata['disable-model-invocation'] !== true, userInvocable: metadata['user-invocable'] !== false } }
  }))
  const provider: SkillProvider = { name: 'openubmc-packaged', list: () => Promise.resolve(candidates),
    async get(candidate, lookup) {
      const { locator, rank: _rank, ...summary } = candidate
      const { content } = parseSkill(await readFile(schema.string().parse(locator), { encoding: 'utf8', signal: lookup.signal }))
      let text = content
      for (const entry of manifest.skills) {
        for (const prefix of ['/root/.agents/skills/', '$HOME/.agents/skills/', '~/.agents/skills/']) {
          text = text.replaceAll(prefix + entry.name, join(workflow, entry.path))
        }
      }
      return { ...summary, content: text }
    },
  }
  ctx.skills.registerProvider(() => provider)
  const authority = await installPortableRuntime(ctx, { ...options, payload, workflow })
  cases.installCaseQueries(ctx, { serverName: 'openubmc-target-runtime' }, session =>
    Object.values(authority(session).runs).filter(run => run !== undefined))
  if (options.kbEnabled) await ctx.plugin(mcp, { serverName: 'openubmc-kb', transport: 'stdio', command: options.node,
    args: [join(workflow, 'openubmc-kb-mcp/src/server.js')], cwd: join(workflow, 'openubmc-kb-mcp'),
    failOnStartupError: true, toolCallTimeoutMs: options.toolCallTimeoutMs })
}
