/** Native authorization waits and exact-start recovery retain their permissions. */
import { expect, it, vi } from 'vitest'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import UserQuestions, { type AskUserQuestionAnswer, type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { bench, response } from './harness.ts'

const start = { kind: 'start', target: '192.0.2.39', intent: 'diagnose-and-fix', delivery_strategy: 'live-patch' }
const approve: AskUserQuestionAnswer = { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run'] }] }
const decline: AskUserQuestionAnswer = { answers: [{ id: 'openubmc-execution', selected: ['Decline'] }] }

it('refuses start recovery while the original native authorization question is still open', async () => {
  const b = await bench()
  const shown = Promise.withResolvers<AskUserQuestionRequest>()
  const answer = Promise.withResolvers<AskUserQuestionAnswer>()
  let pending: ReturnType<typeof b.execute> | undefined
  let leave: (() => void) | undefined
  try {
    await b.ctx.plugin(AgentRegistry)
    await b.ctx.plugin(UserQuestions)
    leave = b.ctx.agents.enter(b.agent, undefined)
    b.ctx.on('user-questions/request', async (request) => { shown.resolve(request); return answer.promise })
    const provider = vi.fn(async () => response())
    b.register('execute', provider)
    pending = b.execute('execute', start)
    const request = await shown.promise
    const original = request.wait?.callId
    expect(original).toBeDefined()
    expect(provider).not.toHaveBeenCalled()
    await expect(b.command(`/target-reconcile ${original}`)).rejects.toThrow('The original start is still running')
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.reconcileCallId).toBeNull()
    expect(b.session.snapshotEvents().filter(event => event.type === 'openubmc/authorization')).toHaveLength(0)
    expect(provider).not.toHaveBeenCalled()
    answer.resolve(approve)
    expect((await pending).isError).toBe(false)
    expect(provider).toHaveBeenCalledOnce()
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
      pendingCalls: {}, uncertainCalls: {}, runScopes: { 'run-owned': { granted: true } },
    })
    expect(b.session.snapshotEvents().filter(event => event.type === 'openubmc/authorization')).toHaveLength(1)
  } finally {
    answer.resolve(decline)
    await pending
    leave?.()
    await b.ctx.fiber.dispose()
  }
})

it.each(['changed arguments', 'Runtime preflight rejection'])('retains the original human approval after recovery is refused: %s', async (refusal) => {
  const b = await bench()
  let leave: (() => void) | undefined
  try {
    await b.ctx.plugin(AgentRegistry)
    await b.ctx.plugin(UserQuestions)
    leave = b.ctx.agents.enter(b.agent, undefined)
    const question = vi.fn(async () => approve)
    b.ctx.on('user-questions/request', question)
    let lost = true
    let rejectReplay = refusal === 'Runtime preflight rejection'
    const provider = vi.fn(async () => {
      if (lost) throw new Error('The provider reply was lost.')
      if (rejectReplay) return { content: [{ type: 'text', text: 'The Runtime preflight is unavailable.' }], isError: true,
        structuredContent: { schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: '', state: 'failed',
          error: { code: 'AgentPreflightError' } } }
      return response()
    })
    b.register('execute', provider)
    const original = await b.execute('execute', start)
    expect(original.isError).toBe(true)
    const state = () => b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!
    expect(Object.keys(state().approvedCalls)).toEqual([original.callId])
    await b.command(`/target-reconcile ${original.callId}`)
    lost = false
    const rejected = await b.execute('execute', rejectReplay ? start : { ...start, target: '192.0.2.40' })
    expect(rejected.isError).toBe(true)
    expect(provider).toHaveBeenCalledTimes(rejectReplay ? 2 : 1)
    expect(Object.keys(state().approvedCalls)).toEqual([original.callId])
    if (rejectReplay) await b.command(`/target-reconcile ${original.callId}`)
    rejectReplay = false
    expect((await b.execute('execute', start)).isError).toBe(false)
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    expect(provider).toHaveBeenCalledTimes(refusal === 'Runtime preflight rejection' ? 4 : 3)
    expect(question).toHaveBeenCalledOnce()
    expect(state()).toMatchObject({ approvedCalls: {}, pendingCalls: {}, uncertainCalls: {},
      runScopes: { 'run-owned': { granted: true } } })
  } finally {
    leave?.()
    await b.ctx.fiber.dispose()
  }
})

it.each([
  { grant: 'execute 192.0.2.39 diagnose-and-fix', args: { deliveryStrategy: 'live-patch' } },
  { grant: 'execute 192.0.2.39 diagnose-and-fix', args: { entryOperation: 'live_patch_run' } },
  { grant: 'execute 192.0.2.39 diagnose-and-fix source-only',
    args: { delivery_strategy: 'source-only', deliveryStrategy: 'live-patch' } },
  { grant: 'execute', args: { entry_operation: 'debug_run', entryOperation: 'upgrade_run' } },
])('rejects start aliases before a scoped or broad grant can permit their different Runtime meaning: %j', async ({ grant, args }) => {
  const b = await bench()
  try {
    const provider = vi.fn(async () => response())
    b.register('execute', provider)
    await b.command(`/target-authorize ${grant}`)
    expect((await b.execute('execute', { kind: 'start', target: start.target, intent: start.intent, ...args })).isError).toBe(true)
    expect(provider).not.toHaveBeenCalled()
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.runs).toEqual({})
  } finally { await b.ctx.fiber.dispose() }
})

it.each([{ deliveryStrategy: 'build-upgrade' }, { entryOperation: 'upgrade_run' }, { target_ip: '192.0.2.40' }])(
  'rejects continuation aliases before they reach Runtime: %j', async (args) => {
    const b = await bench()
    try {
      const provider = vi.fn(async () => response())
      b.register('execute', provider)
      await b.command('/target-authorize execute')
      expect((await b.execute('execute', start)).isError).toBe(false)
      expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned', ...args })).isError).toBe(true)
      expect(provider).toHaveBeenCalledOnce()
      expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.pendingCalls).toEqual({})
    } finally { await b.ctx.fiber.dispose() }
  },
)
