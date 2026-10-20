/** Install the portable openUBMC adapter on a supported Host. @module */
import type { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { z } from 'zod'
import type { Config } from './plugin-config.ts'
import { assertQualifiedHost } from './compatibility.ts'
export { Config } from './plugin-config.ts'

/** Bundle entry registered by cordis.patch.yml. */
export const name = 'openubmc'
/** Host services used by the child plugins. */
export const inject = ['skills', 'tools', 'commands', 'sessionProjections', 'systemPrompt']

/**
 * Load the bundled adapter using public Host registries.
 * @param ctx - Profile plugin context.
 * @param config - Validated deployment settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const host = z.object({ version: z.string() }).parse(createRequire(import.meta.url)('@deepseek-ai/dsh-tools/package.json'))
  assertQualifiedHost(host.version)
  const plugin = await import('./plugin.ts')
  await plugin.apply(ctx, config)
}
