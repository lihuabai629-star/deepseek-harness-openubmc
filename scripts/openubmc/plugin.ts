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
import { installLocalAdmin } from './local-admin.ts'
import { installConfigurationWeb } from './configuration-web.ts'
import { prepareSkillResources } from './skill-resources.ts'

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
    setupTimeoutSeconds: config.setupTimeoutSeconds, configurationIdleSeconds: config.configurationIdleSeconds,
    ...(config.kbConfigFile === undefined ? {} : { kbConfigFile: resolve(config.kbConfigFile) }),
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
  const mountSkills = async () => {
    const manifest = payloadSchema.parse(JSON.parse(await readFile(join(payload, 'skills.json'), 'utf8')))
    const resources = await prepareSkillResources(workflow, options.stateDir, manifest.skills, join(payload, 'environment-skill.md'))
    const candidates: SkillCandidate[] = await Promise.all(manifest.skills.map(async (skill) => {
      const directory = join(resources, skill.path)
      const path = join(directory, 'SKILL.md')
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
        return { ...summary, content }
      },
    }
    ctx.skills.registerProvider(() => provider)
  }
  let skillsMounted = false
  let runtimeMounted = false
  let kbMounted = false
  let mounting: Promise<void> | undefined
  const mount = (): Promise<void> => {
    mounting ??= (async () => {
      let status: Awaited<ReturnType<typeof admin.run>>
      try { status = await admin.run({ command: 'doctor' }) } catch (_error) {
        ctx.logger.warn('openUBMC local environment unavailable; check the configured Python executable and /openubmc-doctor.')
        return
      }
      if (status.ok === false) {
        ctx.logger.warn('openUBMC local diagnostics unavailable; use /openubmc-doctor to inspect interpreter readiness.')
        return
      }
      if (status.integrity !== true) {
        ctx.logger.warn('openUBMC package integrity failed; reinstall a verified archive. Local setup remains available.')
        return
      }
      if (!skillsMounted) { await mountSkills(); skillsMounted = true }
      if (!runtimeMounted) {
        const fiber = ctx.plugin({ name: 'openubmc-native-runtime',
          apply: async (child: Context) => {
            const authority = await installPortableRuntime(child, { ...options, payload, workflow,
              captureWorkspace: admin.capture })
            cases.installCaseQueries(child, { serverName: 'openubmc-target-runtime' }, session =>
              Object.values(authority(session).runs).filter(run => run !== undefined))
          } })
        try { await fiber.await(); runtimeMounted = true } catch (_error) {
          await fiber.dispose()
          ctx.logger.warn('openUBMC Runtime unavailable; use /openubmc-doctor or /openubmc-repair runtime.')
        }
      }
      if (options.kbEnabled && !kbMounted) {
        const entry = schema.object({ entry: schema.string() }).parse(await admin.run({ command: 'kb-entry' })).entry
        const fiber = ctx.plugin(mcp, { serverName: 'openubmc-kb', transport: 'stdio', command: options.node,
          args: [entry], cwd: resolve(entry, '../..'),
          ...(options.kbConfigFile === undefined ? {} : { env: { OPENUBMC_KB_CONFIG: options.kbConfigFile } }),
          failOnStartupError: true, toolCallTimeoutMs: options.toolCallTimeoutMs })
        try { await fiber.await(); kbMounted = true } catch (_error) {
          await fiber.dispose()
          ctx.logger.warn('openUBMC knowledge service unavailable; use /openubmc-doctor or /openubmc-repair kb.')
        }
      }
    })().finally(() => { mounting = undefined })
    return mounting
  }
  const admin = installLocalAdmin(ctx, { ...options, payload }, mount)
  ctx.inject(['webServer', 'connection'], (web) => { installConfigurationWeb(web, admin, options.setupTimeoutSeconds * 1000) })
  await mount()
}
