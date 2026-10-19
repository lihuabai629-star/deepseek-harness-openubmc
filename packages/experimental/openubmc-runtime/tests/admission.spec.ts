/** Pending-call admission, recovery refusals and in-flight plugin lifetime. */
import { expect, it, onTestFinished, vi } from 'vitest'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { publicToolName } from '@deepseek-ai/dsh-mcp-client'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { bench, response } from './harness.ts'

type Bench = Awaited<ReturnType<typeof bench>>
const start = { kind: 'start', target: '192.0.2.39', intent: 'diagnose-and-fix' }
const refused = { content: [{ type: 'text', text: 'Runtime rejected the proposed start' }], isError: true,
  structuredContent: { schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: '', state: 'failed',
    error: { code: 'AgentPreflightError' } } }

async function ownedBench() {
  const b = await bench()
  onTestFinished(() => b.ctx.fiber.dispose())
  return b
}

function recordedCall(b: Bench, callId: ToolCallId, args: Record<string, JsonValue>) {
  return b.session.append('tool/call', { turn: 1, step: 1, callId, name: publicToolName('runtime', 'execute'), arguments: JSON.stringify(args) })
}

function recordedResult(b: Bench, callId: ToolCallId, meta: JsonValue) {
  return b.session.append('tool/result', { turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'Recorded Runtime reply' }], isError: false }), meta,
  }, { surfaceOp: 'append' })
}

it('waits for other interrupted calls to settle before replaying an unacknowledged start', async () => {
  const b = await ownedBench()
  const original = ToolCallId('interrupted-start')
  const other = ToolCallId('interrupted-continuation')
  recordedCall(b, original, start)
  recordedCall(b, other, { kind: 'resume', run_id: 'another-run' })
  await b.command(`/target-reconcile ${original}`)
  const call = vi.fn(async () => response())
  b.register('execute', call)
  const blocked = await b.execute('execute', start)
  expect(blocked.isError).toBe(true)
  expect(blocked.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('Another execute call is still pending')
  expect(call).not.toHaveBeenCalled()
  recordedResult(b, other, { mcp: { serverName: 'runtime', toolName: 'execute', dispatchStatus: 'not-started' } })
  expect((await b.execute('execute', start)).isError).toBe(false)
  expect(call).toHaveBeenCalledOnce()
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
    pendingCalls: {}, uncertainCalls: {}, reconcileCallId: null, runs: { 'run-owned': { run_id: 'run-owned' } },
  })
})

it.each(['pending', 'uncertain'])('retains the original %s operation when a replay receives a known rejection', async (initial) => {
  const b = await ownedBench()
  let original: ToolCallId
  const operations: JsonValue[] = []
  let rejectReplay = true
  b.register('execute', async (_args, _execution, metadata) => {
    operations.push(metadata['openubmc/operationId']!)
    return rejectReplay ? refused : response()
  })
  if (initial === 'pending') {
    original = ToolCallId('interrupted-start')
    recordedCall(b, original, start)
  } else {
    const interrupted = ToolCallId('disconnected-start')
    recordedCall(b, interrupted, start)
    recordedResult(b, interrupted, { mcp: { serverName: 'runtime', toolName: 'execute', dispatchStatus: 'unknown' } })
    original = interrupted
  }
  await b.command(`/target-reconcile ${original}`)
  expect((await b.execute('execute', start)).isError).toBe(true)
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
    runs: {}, pendingCalls: {}, reconcileCallId: null, uncertainCalls: { [original]: { arguments: start, operationId: original } },
  })
  rejectReplay = false
  await b.command(`/target-reconcile ${original}`)
  expect((await b.execute('execute', start)).isError).toBe(false)
  expect(operations).toHaveLength(2)
  expect(operations[0]).toBe(operations[1])
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({ pendingCalls: {}, uncertainCalls: {} })
})

it('retains the unresolved operation identity from an orphaned cached replay after Runtime rejects it', async () => {
  const b = await ownedBench()
  const original = ToolCallId('missing-original')
  const replay = ToolCallId('cached-replay')
  recordedCall(b, original, start)
  await b.command(`/target-reconcile ${original}`)
  recordedCall(b, replay, start)
  const checkpoint = b.ctx.sessionProjections.checkpoint(b.session)
  const row = checkpoint['openubmc/runtime']
  if (row === undefined) throw new Error('The Runtime checkpoint is missing.')
  const cached = { ...b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!,
    pendingCalls: { [replay]: { arguments: start, operationId: original } }, reconcileCallId: null,
  }
  const refusal = b.session.append('tool/result', { turn: 1, step: 1,
    message: createToolResultMessage({ callId: replay, content: [{ type: 'text', text: 'Preflight refusal' }], isError: true }),
    meta: { mcp: { serverName: 'runtime', toolName: 'execute', structuredContent: refused.structuredContent } },
  }, { surfaceOp: 'append' })
  const restored = b.ctx.sessionProjections.restore({ ...checkpoint, 'openubmc/runtime': { ...row, val: cached } },
    [refusal], SessionLogOffset(refusal.seq), b.session.header, b.session.inheritedEventCount)
  expect(restored.checkpoint['openubmc/runtime']?.val).toMatchObject({
    runs: {}, pendingCalls: {}, reconcileCallId: null,
    uncertainCalls: { [original]: { arguments: start, operationId: original } },
  })
})

it('does not bind a foreign Run from recorded continuation output or unrelated MCP metadata', async () => {
  const b = await ownedBench()
  const orphaned = ToolCallId('orphaned-continuation')
  recordedCall(b, orphaned, { kind: 'resume', run_id: 'foreign' })
  recordedResult(b, orphaned, { mcp: { serverName: 'runtime', toolName: 'execute', structuredContent: response('foreign').structuredContent } })
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({ runs: {}, runScopes: {}, pendingCalls: {}, uncertainCalls: {} })
  const unrelated = ToolCallId('unrelated-reply')
  recordedCall(b, unrelated, start)
  recordedResult(b, unrelated, { mcp: { serverName: 'another-server', toolName: 'execute', structuredContent: response().structuredContent } })
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
    runs: {}, runScopes: {}, uncertainCalls: { [unrelated]: { arguments: start } },
  })
})

it('does not infer a dispatch from an argumentless command or a missing Runtime tool', async () => {
  const b = await ownedBench()
  const commandId = CommandId('argumentless-action')
  b.session.append('command/run', { commandId, name: 'target-action', source: { kind: 'user' } })
  b.session.append('command/done', { commandId, kind: 'error' })
  expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.pendingCalls).toEqual({})
  const result = await b.command('/target-action {"kind":"resume","run_id":"unavailable-run"}')
  expect(result?.result.kind).toBe('error')
  const inspection = b.session.snapshotEvents().find(event => event.type === 'openubmc/inspection')
  expect(inspection?.data).toMatchObject({ message: { isError: true } })
  expect(inspection?.data).not.toHaveProperty('meta')
  const state = b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!
  expect(state.runs).toEqual({})
  expect(Object.values(state.uncertainCalls)).toHaveLength(1)
})

it('keeps other active executions registered when a sibling finishes and refuses start recovery until settlement', async () => {
  const b = await ownedBench()
  const firstEntered = Promise.withResolvers<undefined>()
  const secondEntered = Promise.withResolvers<undefined>()
  const releaseFirst = Promise.withResolvers<undefined>()
  const releaseSecond = Promise.withResolvers<undefined>()
  const firstId = ToolCallId('active-first')
  const secondId = ToolCallId('active-second')
  b.register('execute', async (_args, execution) => {
    if (execution.callId === firstId) { firstEntered.resolve(undefined); await releaseFirst.promise }
    else { secondEntered.resolve(undefined); await releaseSecond.promise }
    return response()
  })
  await b.command('/target-authorize execute')
  const execute = (callId: ToolCallId) => b.ctx.tools.execute({ name: publicToolName('runtime', 'execute'), callId,
    arguments: start, agent: b.agent, signal: new AbortController().signal })
  const first = execute(firstId)
  let second: ReturnType<typeof execute> | undefined
  try {
    await firstEntered.promise
    second = execute(secondId)
    await secondEntered.promise
    await expect(b.command(`/target-reconcile ${firstId}`)).rejects.toThrow('The original start is still running')
    releaseSecond.resolve(undefined)
    expect((await second).isError).toBe(false)
    await expect(b.command(`/target-reconcile ${firstId}`)).rejects.toThrow('The original start is still running')
  } finally {
    releaseFirst.resolve(undefined)
    releaseSecond.resolve(undefined)
    await Promise.allSettled([first, second])
  }
  expect((await first).isError).toBe(false)
  await expect(b.command(`/target-reconcile ${firstId}`)).rejects.toThrow('Only an unacknowledged start can be replayed')
})

it('fails closed when Runtime unloads while a provider dispatch is waiting in middleware', async () => {
  const b = await ownedBench()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const call = vi.fn(async () => response())
  b.register('execute', call)
  await b.command('/target-authorize execute')
  b.ctx.on('mcp/tool-call', async (_request, next) => { entered.resolve(undefined); await release.promise; return next() })
  const pending = b.execute('execute', start)
  try {
    await entered.promise
    await b.fiber.dispose()
  } finally { release.resolve(undefined); await pending }
  const result = await pending
  expect(result.isError).toBe(true)
  expect(result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('inactive context')
  expect(call).not.toHaveBeenCalled()
})
