/** External human-input fixture; the product adapter never grants itself authority. */
import { SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-runtime'
import type {} from '@deepseek-ai/dsh-mcp-client'
export const name = 'recovery-human-fixture'
export const inject = ['agents', 'commands', 'sessionProjections', 'sessionPersistence']
declare module '@deepseek-ai/cordis' { interface Context { recoveryFixtureReady: boolean } }
/** Simulate two explicit human grants separated by a persisted Case read. @param ctx - fixture composition. */
export async function apply(ctx: Context): Promise<void> {
  const handle = await ctx.sessionPersistence.create({ version: SESSION_FORMAT_VERSION, id: SessionId('openubmc-recovery-snapshot'), cwd: process.cwd(), createdAt: 1, isSeeded: false, delegationDepth: 0 })
  await handle.flush()
  await handle.close()
  ctx.provide('recoveryFixtureReady')
  ctx.set('recoveryFixtureReady', true)
  ctx.on('agent/created', async ({ agent }) => { await ctx.commands.execute(agent, '/target-authorize upgrade_run', [], new AbortController().signal) })
  ctx.on('mcp/tool-call', async (request, next) => {
    if (request.execution.callId === 'recovered' && request.execution.agent !== undefined) {
      await ctx.commands.execute(request.execution.agent, '/target-authorize upgrade_run', [], request.execution.signal)
    }
    return next()
  })
}
