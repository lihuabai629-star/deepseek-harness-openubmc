/** Gate bindings, caller waits and native operation recovery. */
import { expect, it, vi } from 'vitest'
import { bench, response } from './harness.ts'

it('requires the latest Gate binding and preserves structured failure details', async () => {
  const b = await bench()
  try {
    const call = vi.fn<() => Promise<unknown>>(async () => response())
    b.register('execute', call)
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    const action = { kind: 'respond', run_id: 'run-owned', gate_id: 'gate-owned', gate_version: 1, schema_digest: 'sha256:abc', response: { status: 'completed' } }
    for (const mismatch of [{ gate_id: 'foreign' }, { gate_version: 2 }, { schema_digest: 'wrong' }]) {
      expect((await b.execute('execute', { ...action, ...mismatch })).isError).toBe(true)
    }
    expect(call).toHaveBeenCalledTimes(1)
    expect((await b.execute('execute', { kind: 'control', command: 'cancel', run_id: 'run-owned' })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
    expect((await b.execute('execute', action)).isError).toBe(false)
    call.mockImplementation(async () => ({ ...response(), isError: true, structuredContent: { ...response().structuredContent, state: 'incident',
      incident: { incident_id: 'incident-1', code: 'effect_outcome_unknown', allowed_commands: ['reconcile', 'cancel'] } } }))
    const failed = await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })
    expect(failed.isError).toBe(true)
    expect(failed.meta).toMatchObject({ mcp: { structuredContent: { incident: { incident_id: 'incident-1' } } } })
    expect((await b.execute('execute', { kind: 'control', command: 'cancel', run_id: 'run-owned', incident_id: 'foreign' })).isError).toBe(true)
  } finally { await b.ctx.fiber.dispose() }
})

it('retains an unknown execute outcome when the response is malformed or reports an unclassified failure', async () => {
  for (const structuredContent of [{ unexpected: true }, {
    schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: '', state: 'failed', error: { code: 'InternalError' },
  }]) {
    const b = await bench()
    try {
      const call = vi.fn(async () => ({ content: [{ type: 'text', text: 'unclassified failure' }], isError: true, structuredContent }))
      b.register('execute', call)
      await b.command('/target-authorize execute')
      const failed = await b.execute('execute', { kind: 'start' })
      expect(failed.isError).toBe(true)
      expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.uncertainCalls).toHaveProperty(failed.callId)
      expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
      expect(call).toHaveBeenCalledTimes(1)
    } finally { await b.ctx.fiber.dispose() }
  }
})

it('bounds observation and execute waits separately before any provider callback', async () => {
  const b = await bench()
  try {
    const call = vi.fn<() => Promise<unknown>>(async () => response())
    b.register('execute', call, 11000)
    b.register('observe', call, 21000)
    await b.command('/target-authorize execute')
    for (const deadline of [0, -1, 11, 'invalid']) expect((await b.execute('execute', { kind: 'start', deadline })).isError).toBe(true)
    expect((await b.execute('observe', { deadline: 20 })).isError).toBe(false)
    expect((await b.execute('observe', { deadline: 21 })).isError).toBe(true)
    expect((await b.execute('execute', { kind: 'start', deadline: 10 })).isError).toBe(false)
    expect(call).toHaveBeenCalledTimes(2)
  } finally { await b.ctx.fiber.dispose() }
})

it('replays an unacknowledged start with the same native identity and requires Run reconciliation after a later disconnect', async () => {
  const b = await bench()
  try {
    const calls: string[] = []
    let lost = true
    b.register('execute', async (_args, _execution, metadata) => {
      calls.push(String(metadata['openubmc/operationId']))
      if (lost) throw new Error('offline transport lost')
      return response()
    })
    await b.command('/target-authorize execute')
    const original = await b.execute('execute', { kind: 'start', intent: 'diagnose-and-fix' })
    expect(original.isError).toBe(true)
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
    await b.command(`/target-reconcile ${original.callId}`)
    expect((await b.execute('execute', { kind: 'start', intent: 'changed' })).isError).toBe(true)
    lost = false
    expect((await b.execute('execute', { kind: 'start', intent: 'diagnose-and-fix' })).isError).toBe(false)
    expect(calls[1]).toBe(calls[0])
    lost = true
    await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(true)
    lost = false
    expect((await b.execute('execute', { kind: 'control', command: 'reconcile', run_id: 'run-owned' })).isError).toBe(false)
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(false)
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.uncertainCalls).toEqual({})
  } finally { await b.ctx.fiber.dispose() }
})
