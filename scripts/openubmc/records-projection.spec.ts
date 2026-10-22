/** Durable observed usage, failed attempts and fork isolation. @module */
import { Context } from '@deepseek-ai/cordis'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import { expect, it, onTestFinished } from 'vitest'
import { recordsProjection } from './records-projection.ts'

async function fixture() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Sessions)
  await ctx.plugin(Projections)
  ctx.sessionProjections.register(recordsProjection)
  return { ctx, session: ctx.sessions.create(SessionId('usage-owner')) }
}

it('retains the latest reported usage from a failed attempt without assigning a Run', async () => {
  const { ctx, session } = await fixture()
  session.append('assistant/attempt', { turn: 0, step: 0, stream: [
    { type: 'chunk', time: 1, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } } },
    { type: 'chunk', time: 2, chunk: { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } } },
  ] })
  expect(ctx.sessionProjections.stateOf(session, 'openubmc/host-records')?.measurements).toEqual([
    { invocation_ref: 'dsh:settlement:0', run_ref: null, usage: { input_tokens: 12, output_tokens: 3 } },
  ])
})

it('excludes inherited provider usage when a Session forks', async () => {
  const { ctx, session } = await fixture()
  session.append('assistant/attempt', { turn: 0, step: 0, stream: [] })
  const child = ctx.sessions.fork(session)
  expect(ctx.sessionProjections.stateOf(child, 'openubmc/host-records')?.measurements).toEqual([])
})
