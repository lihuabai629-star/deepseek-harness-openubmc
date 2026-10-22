/** Keyless preflight and optional lifecycle check for the packed bundle. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import * as model from '../../packages/mcp/mcp-client/tests/fixtures/runtime-status-model.ts'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'

/** Preflight provider entry. */
export const name = 'openubmc-preflight'
/** Registries inspected by the optional lifecycle check. */
export const inject = ['llm', 'loader', 'tools', 'skills', 'commands']

/** Checks performed after the invalid observation completes. */
export interface Config {
  /** Dispose and remount the bundle in memory after the keyless model turn. */
  verifyLifecycle: boolean
  /** Exercise setup tools when the Runtime interpreter cannot start. */
  verifySetupOnly: boolean
}
/** Lifecycle verification is disabled for ordinary preflight runs. */
export const Config: z<Config> = z.object({ verifyLifecycle: z.boolean().default(false), verifySetupOnly: z.boolean().default(false) })

class SetupOnlyModel extends LlmAdapter {
  override resolveModel(provider: string, id: string): Promise<LlmResolvedModelInfo> { return Promise.resolve({ provider, id, name: id }) }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await Promise.resolve()
    if (!options.tools?.some(tool => tool.name === 'openubmc_setup_status')
      || options.tools.some(tool => tool.name.startsWith('mcp__openubmc-target-runtime__'))) throw new Error('Setup-only tool discovery failed')
    const last = options.messages.at(-1)
    if (last?.role !== 'tool') {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('setup-status'), name: 'openubmc_setup_status', arguments: '{}' } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      const text = last.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      if (last.isError === true || !text.includes('"interpreter":false')) throw new Error('Missing interpreter diagnostic was not retained')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'OPENUBMC_SETUP_ONLY_OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

/**
 * Register the scripted preflight and optional registry cleanup assertions.
 * @param ctx - Composed profile context.
 * @param config - Whether to exercise disposal and remount without saving settings.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.verifySetupOnly) ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new SetupOnlyModel()))
  else model.apply(ctx)
  if (!config.verifyLifecycle) return
  let completed = false
  ctx.on('agent/turn-stopping', async ({ agent }) => {
    if (completed) return
    completed = true
    const entry = [...ctx.loader.entries()].find(entry => entry.options.name === 'dsh-openubmc')
    if (entry?.fiber === undefined) throw new Error('The installed openUBMC bundle is unavailable.')
    const selected = async () => ({
      tools: ctx.tools.schemas().filter(tool => tool.name.startsWith('mcp__openubmc-')).map(tool => tool.name).sort(),
      skills: (await ctx.skills.list()).filter(skill => skill.provider === 'openubmc-packaged').map(skill => skill.name).sort(),
      commands: ctx.commands.list(agent).filter(command => ['run', 'case', 'target-authorize', 'target-action', 'target-reconcile',
        'openubmc-configure', 'openubmc-doctor', 'openubmc-repair', 'openubmc-records']
        .includes(command.name)).map(command => command.name).sort(),
    })
    const before = await selected()
    if (before.tools.length === 0 || before.skills.length === 0 || before.commands.length === 0) {
      throw new Error('openUBMC registrations are missing before disposal.')
    }
    const setup = await ctx.skills.get('openubmc-environment-setup')
    if (setup?.provider !== 'openubmc-packaged' || !setup.content.includes('dsh plugin --profile')) {
      throw new Error('The packaged environment Skill must use DSH plugin management.')
    }
    const debug = await ctx.skills.get('openubmc-debug')
    if (debug?.resourceBase?.kind !== 'directory') throw new Error('The packaged Debug resources are unavailable.')
    const references = debug.resourceBase.path
    const instructions = await readFile(join(references, 'references/diagnostic-advice.md'), 'utf8')
    if (instructions.includes('$HOME/.agents/skills/') || !instructions.includes(join(references, 'scripts/diagnostic_advice.py'))) {
      throw new Error('Packaged reference commands do not resolve to their installed resource generation.')
    }
    await readFile(join(references, 'scripts/diagnostic_advice.py'))
    const doctor = await ctx.commands.execute(agent, '/openubmc-doctor', [], new AbortController().signal)
    if (doctor?.result.kind !== 'success' || doctor.result.text?.includes('"integrity": true') !== true) {
      throw new Error('The installed plugin did not pass its native local readiness check.')
    }
    const records = await ctx.commands.execute(agent, '/openubmc-records export', [], new AbortController().signal)
    if (records?.result.kind !== 'success' || records.result.text?.includes('content_digest') !== true) {
      throw new Error('The installed plugin could not export the current Session records.')
    }
    const page = await ctx.commands.execute(agent, '/openubmc-configure', [], new AbortController().signal)
    if (page?.result.kind !== 'success' || page.result.text === undefined) throw new Error('The native configuration command is unavailable.')
    const url = new URL(page.result.text)
    const headers = { 'X-OpenUBMC-Session': url.hash.slice(1), Origin: url.origin, 'Content-Type': 'application/json' }
    const denied = await fetch(new URL('/api/state', url))
    if (denied.status !== 403) throw new Error('Private configuration accepted an unauthenticated request.')
    const state = await fetch(new URL('/api/state', url), { headers })
    if (!state.ok) throw new Error('The native configuration page cannot read its local state.')
    const status = await fetch(new URL('/api/plugin', url), { method: 'POST', headers, body: JSON.stringify({ action: 'status' }) })
    if (!status.ok) throw new Error('The configuration page cannot run DSH-owned diagnostics.')
    const close = await fetch(new URL('/api/close', url), { method: 'POST', headers, body: '{}' })
    if (!close.ok) throw new Error('The configuration page could not close its owned server.')
    const grant = await ctx.commands.execute(agent, '/target-authorize execute 192.0.2.39 diagnose-and-fix source-only',
      [], new AbortController().signal)
    if (grant?.result.kind !== 'success') throw new Error('The official Host could not record native scoped authorization.')
    // Marking the in-memory entry disabled prevents self-disposal from saving a user patch.
    entry.options.disabled = true
    await entry.fiber.dispose()
    const after = await selected()
    if (after.tools.length || after.skills.length || after.commands.length) throw new Error('openUBMC registrations survived disposal.')
    entry.options.disabled = false
    await entry.init()
    await entry.fiber.await()
    if (JSON.stringify(await selected()) !== JSON.stringify(before)) throw new Error('openUBMC registrations changed after remount.')
    const revoke = await ctx.commands.execute(agent, '/target-authorize revoke', [], new AbortController().signal)
    if (revoke?.result.kind !== 'success') throw new Error('The remounted provider could not revoke retained authorization.')
    console.log('OPENUBMC_LIFECYCLE_OK')
  })
}
