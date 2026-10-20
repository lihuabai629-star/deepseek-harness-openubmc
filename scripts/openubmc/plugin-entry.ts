/** Check installed Host capabilities before importing native openUBMC adapters. @module */
import type { Context } from '@deepseek-ai/cordis'
import * as sessions from '@deepseek-ai/dsh-session'
import * as tools from '@deepseek-ai/dsh-tools'
import type { Config } from './plugin-config.ts'
export { Config } from './plugin-config.ts'

/** Bundle entry registered by cordis.patch.yml. */
export const name = 'openubmc'
/** Host services used by the child plugins. */
export const inject = ['skills', 'tools', 'commands', 'sessionProjections', 'systemPrompt']

/**
 * Refuse unsupported Hosts before loading adapters that use their newer exports.
 * @param ctx - Profile plugin context.
 * @param config - Validated deployment settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!Object.hasOwn(tools, 'ToolFailureError') || !Object.hasOwn(sessions, 'KNOWN_SESSION_EVENT_TYPES')
    || !sessions.KNOWN_SESSION_EVENT_TYPES.has('openubmc/authorization')
    || !sessions.KNOWN_SESSION_EVENT_TYPES.has('openubmc/inspection')) {
    throw new Error('openUBMC requires a DSH build with native openUBMC MCP authority and Session event support. Install the compatible openUBMC DSH build.')
  }
  const plugin = await import('./plugin.ts')
  await plugin.apply(ctx, config)
}
