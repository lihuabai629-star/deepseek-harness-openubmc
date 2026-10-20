/** Keyless preflight and optional lifecycle check for the packed bundle. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import * as model from '../../packages/mcp/mcp-client/tests/fixtures/runtime-status-model.ts'

/** Preflight provider entry. */
export const name = 'openubmc-preflight'
/** Registries inspected by the optional lifecycle check. */
export const inject = ['llm', 'loader', 'tools', 'skills', 'commands']

/** Checks performed after the invalid observation completes. */
export interface Config {
  /** Dispose and remount the bundle in memory after the keyless model turn. */
  verifyLifecycle: boolean
}
/** Lifecycle verification is disabled for ordinary preflight runs. */
export const Config: z<Config> = z.object({ verifyLifecycle: z.boolean().default(false) })

/**
 * Register the scripted preflight and optional registry cleanup assertions.
 * @param ctx - Composed profile context.
 * @param config - Whether to exercise disposal and remount without saving settings.
 */
export function apply(ctx: Context, config: Config): void {
  model.apply(ctx)
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
      commands: ctx.commands.list(agent).filter(command => ['run', 'case', 'target-authorize', 'target-action', 'target-reconcile']
        .includes(command.name)).map(command => command.name).sort(),
    })
    const before = await selected()
    if (before.tools.length === 0 || before.skills.length === 0 || before.commands.length === 0) {
      throw new Error('openUBMC registrations are missing before disposal.')
    }
    // Marking the in-memory entry disabled prevents self-disposal from saving a user patch.
    entry.options.disabled = true
    await entry.fiber.dispose()
    const after = await selected()
    if (after.tools.length || after.skills.length || after.commands.length) throw new Error('openUBMC registrations survived disposal.')
    entry.options.disabled = false
    await entry.init()
    await entry.fiber.await()
    if (JSON.stringify(await selected()) !== JSON.stringify(before)) throw new Error('openUBMC registrations changed after remount.')
    console.log('OPENUBMC_LIFECYCLE_OK')
  })
}
