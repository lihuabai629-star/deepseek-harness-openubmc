/** Native diagnostic permission and human-scoped Run authority. */
import { expect, it, vi } from 'vitest'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { publicToolName } from '@deepseek-ai/dsh-mcp-client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { bench, config, response } from './harness.ts'

const target = '192.0.2.39'
const start = { kind: 'start', target, intent: 'diagnose-and-fix', delivery_strategy: 'live-patch' }

async function approvedStart(b: Awaited<ReturnType<typeof bench>>, args: Record<string, JsonValue>) {
  const callId = ToolCallId('human-approved-start')
  const name = publicToolName('runtime', 'execute')
  const call = b.session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
  b.session.append('openubmc/authorization', { callId, arguments: { ...args, deadline: config.operationDeadlineSeconds } })
  const result = await b.ctx.tools.execute({ name, callId, arguments: args, agent: b.agent, signal: new AbortController().signal })
  b.session.append('tool/result', { turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
    ...(result.meta === undefined ? {} : { meta: result.meta }),
    ...(result.error?.info === undefined ? {} : { error: result.error.info }),
  }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
  return result
}

it('completes default read-only diagnosis without an execution grant and denies a custom operation', async () => {
  const b = await bench()
  try {
    const call = vi.fn(async () => response())
    b.register('execute', call)
    const diagnostic = { kind: 'start', target, intent: 'diagnosis-only' }
    expect((await b.execute('execute', diagnostic)).isError).toBe(false)
    expect((await b.execute('execute', { kind: 'respond', run_id: 'run-owned', gate_id: 'gate-owned', gate_version: 1,
      schema_digest: 'sha256:abc', response: { status: 'failed', summary: 'Missing evidence', payload: {} } })).isError).toBe(false)
    expect((await b.execute('execute', { ...diagnostic, entry_operation: 'live_patch_run' })).isError).toBe(true)
    expect((await b.execute('execute', { ...diagnostic, delivery_strategy: 'live-patch' })).isError).toBe(true)
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned', target: '192.0.2.40' })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(2)
  } finally { await b.ctx.fiber.dispose() }
})

it('limits scoped native grants by target, intent and delivery and revokes their continuations', async () => {
  const b = await bench()
  let seed
  try {
    const call = vi.fn(async () => response())
    b.register('execute', call)
    await b.command(`/target-authorize execute ${target} diagnose-and-fix live-patch`)
    expect((await b.execute('execute', start)).isError).toBe(false)
    for (const changed of [{ target: '192.0.2.40' }, { intent: 'upgrade-and-verify' }, { delivery_strategy: 'build-upgrade' },
      { entry_operation: 'upgrade_run' }, { targets: [{ ip: target }, { ip: '192.0.2.40' }] }]) {
      expect((await b.execute('execute', { ...start, ...changed })).isError).toBe(true)
    }
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    const fork = b.ctx.sessions.fork(b.session, undefined, SessionId('scoped-fork'))
    expect((await b.execute('execute', start, { ...b.agent, id: fork.id, session: fork })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(2)
    seed = b.session.snapshotEvents()
  } finally { await b.ctx.fiber.dispose() }
  const restored = await bench(seed, { ...config, operationDeadlineSeconds: 5 })
  try {
    const call = vi.fn(async () => response())
    restored.register('execute', call)
    expect((await restored.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    await restored.command('/target-authorize revoke')
    expect((await restored.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  } finally { await restored.ctx.fiber.dispose() }
})

it('retains a native human decision only for its exact start and returned Run across restart', async () => {
  const b = await bench()
  let seed
  try {
    b.register('execute', async () => response())
    expect((await approvedStart(b, start)).isError).toBe(false)
    expect(b.ctx.sessionProjections.snapshot(b.session).values['openubmc/runtime']).toMatchObject({
      authorized: true, executableRunIds: ['run-owned'],
    })
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    expect((await b.execute('execute', start)).isError).toBe(true)
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
      operations: [], scopes: [], approvedCalls: {}, runScopes: { 'run-owned': { granted: true } },
    })
    seed = b.session.snapshotEvents()
  } finally { await b.ctx.fiber.dispose() }
  const restored = await bench(seed, { ...config, operationDeadlineSeconds: 5 })
  try {
    const call = vi.fn(async () => response())
    restored.register('execute', call)
    expect(restored.ctx.sessionProjections.stateOf(restored.session, 'openubmc/runtime')).toMatchObject({
      runScopes: { 'run-owned': { granted: true } },
    })
    expect((await restored.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    await restored.command('/target-authorize revoke')
    expect((await restored.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  } finally { await restored.ctx.fiber.dispose() }
})

it('rejects changed arguments after middleware even when a human approved the original start', async () => {
  const b = await bench()
  try {
    const call = vi.fn(async () => response())
    b.register('execute', call)
    b.ctx.on('mcp/tool-call', (request, next) => { request.arguments.target = '192.0.2.40'; return next() })
    expect((await approvedStart(b, start)).isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.approvedCalls).toEqual({})
  } finally { await b.ctx.fiber.dispose() }
})

it('recovers a human-approved start with its original operation identity after losing the reply', async () => {
  const b = await bench()
  try {
    let lost = true
    const ids: JsonValue[] = []
    b.register('execute', async (_args, _exec, metadata) => {
      ids.push(metadata['openubmc/operationId']!)
      if (lost) throw new Error('reply lost')
      return response()
    })
    expect((await approvedStart(b, start)).isError).toBe(true)
    await b.command('/target-reconcile human-approved-start')
    lost = false
    expect((await b.execute('execute', start)).isError).toBe(false)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
      approvedCalls: {}, pendingCalls: {}, uncertainCalls: {}, runScopes: { 'run-owned': { granted: true } },
    })
  } finally { await b.ctx.fiber.dispose() }
})
