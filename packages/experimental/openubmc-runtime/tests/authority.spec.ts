/** Human Run decisions and target-scoped execution permissions. */
import { expect, it, onTestFinished, vi } from 'vitest'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcRunId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import type { McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import UserQuestions, { type AskUserQuestionAnswer, type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { commandGrant, executionAllowed, readOnlyScope, requestRunAuthorization, startScope } from '../src/authority.ts'
import type { OpenUbmcExecutionScope, OpenUbmcRuntimeState } from '../src/types.ts'
import { bench, response } from './harness.ts'

const target = '192.0.2.39'
const otherTarget = '192.0.2.40'
const start = { kind: 'start', target, intent: 'diagnose-and-fix' }
const approve: AskUserQuestionAnswer = { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run'] }] }

async function authorityBench(questions = true) {
  const b = await bench()
  onTestFinished(() => b.ctx.fiber.dispose())
  if (questions) {
    await b.ctx.plugin(AgentRegistry)
    await b.ctx.plugin(UserQuestions)
    const leave = b.ctx.agents.enter(b.agent, undefined)
    onTestFinished(leave)
  }
  const state = () => {
    const value = b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')
    if (value === undefined) throw new Error('The authority projection is missing.')
    return value
  }
  const request = async (args: Record<string, unknown>): Promise<McpToolCall> => {
    const observed = Promise.withResolvers<McpToolCall>()
    const dispose = b.ctx.on('mcp/tool-call', (call, next) => { observed.resolve(call); return next() })
    const unregister = b.register('observe', async () => ({ content: [{ type: 'text', text: 'read-only probe' }] }))
    try {
      expect((await b.execute('observe')).isError).toBe(false)
      const call = await observed.promise
      return { ...call, toolName: 'execute', arguments: args, appliedPolicies: new Map(), metadata: {} }
    } finally { dispose(); unregister() }
  }
  return { ...b, state, request }
}

it('resolves single and multiple targets while retaining explicit delivery and entry operations', () => {
  expect(startScope(start)).toEqual({ targets: [target], intent: start.intent, deliveryStrategy: null, entryOperation: null })
  const targets = [{ ip: target }, { ip: otherTarget }]
  const scope = { targets: [target, otherTarget], intent: start.intent, deliveryStrategy: 'live-patch', entryOperation: 'live_patch_run' }
  for (const selection of [{ targets }, { target, targets }]) {
    expect(startScope({ kind: 'start', intent: start.intent, ...selection,
      delivery_strategy: scope.deliveryStrategy, entry_operation: scope.entryOperation })).toEqual(scope)
  }
  expect(readOnlyScope(null)).toBe(false)
  expect(readOnlyScope(startScope({ ...start, intent: 'diagnosis-only' }))).toBe(true)
  expect(readOnlyScope(startScope({ ...start, intent: 'diagnosis-only', entry_operation: 'live_patch_run' }))).toBe(false)
  expect(readOnlyScope(startScope({ ...start, intent: 'diagnosis-only', delivery_strategy: 'live-patch' }))).toBe(false)
})

it.each([
  {}, { kind: 'resume', target, intent: start.intent }, { kind: 'start', intent: start.intent },
  { ...start, target: '' }, { ...start, intent: '' }, { ...start, targets: [{ ip: target }] },
  { ...start, target: otherTarget, targets: [{ ip: target }, { ip: otherTarget }] },
])('rejects an incomplete or contradictory start scope: %j', (args) => {
  expect(startScope(args)).toBeNull()
})

it('accepts explicit full grants, revocation and bounded native command scopes', () => {
  expect(commandGrant('execute')).toBe('execute')
  expect(commandGrant('revoke')).toBe('revoke')
  expect(commandGrant(`execute ${target} ${start.intent}`)).toEqual({
    targets: [target], intent: start.intent, deliveryStrategy: null, entryOperation: null,
  })
  for (const deliveryStrategy of ['source-only', 'live-patch', 'build-upgrade']) {
    expect(commandGrant(`execute ${target} ${start.intent} ${deliveryStrategy}`)).toMatchObject({ deliveryStrategy })
  }
})

it.each(['', 'execute target', `observe ${target} diagnosis-only`, `execute ${target} diagnosis-only live-patch extra`])(
  'rejects invalid authorization command syntax: %s', (input) => {
    expect(() => commandGrant(input)).toThrow('Usage: /target-authorize')
  },
)

it('rejects unsupported delivery and oversized targets in native commands', () => {
  expect(() => commandGrant(`execute ${target} ${start.intent} arbitrary`)).toThrow('Unsupported delivery strategy')
  expect(() => commandGrant(`execute ${'x'.repeat(513)} ${start.intent}`)).toThrow()
})

it('requires an exact approved start or matching target scope unless diagnosis is read-only', async () => {
  const b = await authorityBench(false)
  const request = await b.request({ ...start, purpose: 'Inspect the missing resource' })
  const state = b.state()
  expect(executionAllowed(request, state)).toBe(false)
  const approved: OpenUbmcRuntimeState = { ...state, approvedCalls: { [request.execution.callId]: { ...start, purpose: 'Inspect the missing resource' } } }
  expect(executionAllowed(request, approved)).toBe(true)
  expect(executionAllowed({ ...request, arguments: { ...request.arguments, purpose: 'Another task' } }, approved)).toBe(false)
  const scope = commandGrant(`execute ${target} ${start.intent}`)
  if (typeof scope === 'string') throw new Error('Expected a scoped permission.')
  const scoped = { ...state, scopes: [scope] }
  expect(executionAllowed(request, scoped)).toBe(true)
  expect(executionAllowed({ ...request, arguments: { ...start, target: otherTarget } }, scoped)).toBe(false)
  expect(executionAllowed({ ...request, arguments: { kind: 'start' } }, scoped)).toBe(false)
  expect(executionAllowed({ ...request, arguments: { ...start, intent: 'diagnosis-only' } }, state)).toBe(true)
  expect(executionAllowed(request, { ...state, operations: ['execute'] })).toBe(true)
})

it('allows only retained owned Run permissions and denies missing, foreign or revoked scopes', async () => {
  const b = await authorityBench(false)
  const request = await b.request({ kind: 'resume', run_id: 'run-scoped' })
  const scope: OpenUbmcExecutionScope = { targets: [target], intent: start.intent, deliveryStrategy: null, entryOperation: null }
  const state: OpenUbmcRuntimeState = { ...b.state(), scopes: [scope], runScopes: {
    [brandString<OpenUbmcRunId>('run-scoped')]: { scope, granted: false },
    [brandString<OpenUbmcRunId>('run-diagnostic')]: { scope: { ...scope, intent: 'diagnosis-only' }, granted: false },
    [brandString<OpenUbmcRunId>('run-approved')]: { scope: null, granted: true },
    [brandString<OpenUbmcRunId>('run-unscoped')]: { scope: null, granted: false },
  } }
  for (const run_id of ['run-scoped', 'run-diagnostic', 'run-approved']) {
    expect(executionAllowed({ ...request, arguments: { kind: 'resume', run_id } }, state)).toBe(true)
  }
  for (const args of [{ kind: 'resume' }, { kind: 'resume', run_id: 1 },
    { kind: 'resume', run_id: 'foreign' }, { kind: 'resume', run_id: 'run-unscoped' }]) {
    expect(executionAllowed({ ...request, arguments: args }, state)).toBe(false)
  }
  expect(executionAllowed(request, { ...state, scopes: [] })).toBe(false)
})

const starts = [
  { args: { ...start, purpose: 'Repair the missing resource', delivery_strategy: 'source-only', entry_operation: 'source_plan' },
    questionTargets: target,
    detail: 'Repair the missing resource\nOperation: diagnose-and-fix\nDelivery: source-only\nEntry: source_plan\nPermission covers this Run and its stage continuations.' },
  { args: { kind: 'start', targets: [{ ip: target }, { ip: otherTarget }], intent: start.intent },
    questionTargets: `${target}, ${otherTarget}`,
    detail: 'diagnose-and-fix\nOperation: diagnose-and-fix\nDelivery: Runtime default\nEntry: Runtime default\nPermission covers this Run and its stage continuations.' },
]

it.each(starts)('retains a native human decision for its Run without granting other starts: %j', async ({ args, questionTargets, detail }) => {
  const b = await authorityBench()
  const delegated = vi.fn()
  b.ctx.on('user-questions/request', (_request, next) => { delegated(); return next() })
  const answer = vi.fn(async (question: AskUserQuestionRequest) => {
    expect(question.agent).toBe(b.agent)
    expect(question.wait?.callId).toBeDefined()
    expect(question.signal?.aborted).toBe(false)
    expect(question.questions).toEqual([expect.objectContaining({ id: 'openubmc-execution',
      question: `Allow this task on ${questionTargets}?`, detail,
      options: [expect.objectContaining({ label: 'Authorize this Run' }), expect.objectContaining({ label: 'Decline' })],
    })])
    return approve
  })
  const stopAnswering = b.ctx.on('user-questions/request', answer)
  const provider = vi.fn(async () => response())
  b.register('execute', provider)
  expect((await b.execute('execute', args)).isError).toBe(false)
  expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
  expect(b.state()).toMatchObject({ operations: [], scopes: [], approvedCalls: {}, runScopes: { 'run-owned': { granted: true } } })
  expect(answer).toHaveBeenCalledOnce()
  expect(delegated).toHaveBeenCalledOnce()
  expect(b.session.snapshotEvents().filter(event => event.type === 'openubmc/authorization')).toHaveLength(1)
  stopAnswering()
  expect((await b.execute('execute', args)).isError).toBe(true)
  expect(provider).toHaveBeenCalledTimes(2)
})

it.each<AskUserQuestionAnswer>([
  { answers: [] }, { answers: [{ id: 'openubmc-execution', selected: [] }] },
  { answers: [{ id: 'openubmc-execution', selected: ['Decline'] }] },
  { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run', 'Decline'] }] },
  { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run'], custom: 'with changes' }] },
  { answers: [{ id: 'another-question', selected: ['Authorize this Run'] }] },
])('leaves the proposed task unstarted without one explicit approval: %j', async (answer) => {
  const b = await authorityBench()
  b.ctx.on('user-questions/request', async () => answer)
  const provider = vi.fn(async () => response())
  b.register('execute', provider)
  const result = await b.execute('execute', start)
  expect(result.isError).toBe(true)
  expect(result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('Target execution was not authorized.')
  expect(provider).not.toHaveBeenCalled()
  expect(b.session.snapshotEvents().some(event => event.type === 'openubmc/authorization')).toBe(false)
})

it('rejects a start that changes while its native human question is pending', async () => {
  const b = await authorityBench()
  const request = await b.request({ ...start })
  const shown = Promise.withResolvers<undefined>()
  const answer = Promise.withResolvers<AskUserQuestionAnswer>()
  b.ctx.on('user-questions/request', async () => { shown.resolve(undefined); return answer.promise })
  const pending = requestRunAuthorization(b.ctx, request)
  const rejected = expect(pending).rejects.toThrow('The proposed start changed while authorization was pending.')
  try {
    await shown.promise
    expect(b.state().approvedCalls).toEqual({})
    request.arguments.target = otherTarget
  } finally { answer.resolve(approve); await rejected }
  expect(b.session.snapshotEvents().some(event => event.type === 'openubmc/authorization')).toBe(false)
})

it('requires a valid start, a calling Agent and the native question service', async () => {
  const b = await authorityBench()
  const request = await b.request({ ...start })
  const answer = vi.fn(async () => approve)
  b.ctx.on('user-questions/request', answer)
  for (const arguments_ of [{ kind: 'start' }, { kind: 'resume', target, intent: start.intent }]) {
    await expect(requestRunAuthorization(b.ctx, { ...request, arguments: arguments_ })).rejects.toThrow('requires human authorization for this scope')
  }
  const { agent: _agent, ...execution } = request.execution
  await expect(requestRunAuthorization(b.ctx, { ...request, execution })).rejects.toThrow('requires human authorization for this scope')
  const withoutQuestions = await authorityBench(false)
  await expect(requestRunAuthorization(withoutQuestions.ctx, request)).rejects.toThrow('requires human authorization for this scope')
  expect(answer).not.toHaveBeenCalled()
  expect(b.state().approvedCalls).toEqual({})
})
