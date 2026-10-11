/** Optional Case presentation; the Host publishes its trusted source to browser pages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Config } from './config.ts'
export { Config } from './config.ts'
/**
 * Embed validated Case settings before Client plugin activation.
 * @param ctx - Host page owner.
 * @param config - trusted Runtime namespace.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: '__DSH_OPENUBMC_CASES_CONFIG__', value: config })
  })
}
