/** Gate bindings, caller waits and native operation recovery. */
import { expect, it, vi } from 'vitest'
import { bench, response } from './harness.ts'

it('submits native Gate responses through the same authority policy and retains failures across restart', async () => {
  const b = await bench()
  try {
    const call = vi.fn<() => Promise<unknown>>(async () => response())
    b.register('execute', call)
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    const action = { kind: 'respond', run_id: 'run-owned', gate_id: 'gate-owned', gate_version: 1,
      schema_digest: 'sha256:abc', submission_id: 'submission-1', response: { status: 'failed', summary: 'evidence is incomplete', payload: {} } }
    expect((await b.command(`/target-action ${JSON.stringify({ ...action, gate_version: 2 })}`))?.result.kind).toBe('error')
    expect(call).toHaveBeenCalledTimes(1)
    await expect(b.command('/target-action {"kind":"start"}')).rejects.toThrow('continue an existing Run')
    expect(call).toHaveBeenCalledTimes(1)
    call.mockImplementation(async () => ({ ...response(), isError: true,
      structuredContent: { ...response().structuredContent, state: 'failed', outcome: { status: 'failed' } } }))
    expect((await b.command(`/target-action ${JSON.stringify(action)}`))?.result.kind).toBe('error')
    expect(call).toHaveBeenCalledTimes(2)
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
      runs: { 'run-owned': { state: 'failed', outcome: { status: 'failed' } } }, pendingCalls: {}, uncertainCalls: {},
    })
    const inspections = b.session.snapshotEvents().filter(event => event.type === 'openubmc/inspection')
    expect(inspections).toHaveLength(2)
    const restarted = await bench(b.session.snapshotEvents())
    try {
      expect(restarted.ctx.sessionProjections.stateOf(restarted.session, 'openubmc/runtime')).toMatchObject({
        operations: ['execute'], runs: { 'run-owned': { state: 'failed' } }, pendingCalls: {}, uncertainCalls: {},
      })
    } finally { await restarted.ctx.fiber.dispose() }
    await b.command('/target-authorize revoke')
    expect((await b.command('/target-action {"kind":"resume","run_id":"run-owned"}'))?.result.kind).toBe('error')
    expect(call).toHaveBeenCalledTimes(2)
  } finally { await b.ctx.fiber.dispose() }
})

it('keeps an interrupted native continuation pending until reconciliation of its Run', async () => {
  const b = await bench()
  try {
    b.register('execute', async () => response())
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    await b.command('/target-action {"kind":"resume","run_id":"run-owned"}')
    const events = b.session.snapshotEvents()
    const nativeResult = events.findIndex(event => event.type === 'openubmc/inspection')
    const restarted = await bench(events.slice(0, nativeResult))
    try {
      const call = vi.fn(async () => response())
      restarted.register('execute', call)
      expect((await restarted.command('/target-action {"kind":"resume","run_id":"run-owned"}'))?.result.kind).toBe('error')
      expect(call).not.toHaveBeenCalled()
      expect((await restarted.command('/target-action {"kind":"control","command":"reconcile","run_id":"run-owned"}'))?.result.kind).toBe('success')
      expect(call).toHaveBeenCalledTimes(1)
      expect(restarted.ctx.sessionProjections.stateOf(restarted.session, 'openubmc/runtime')).toMatchObject({ pendingCalls: {}, uncertainCalls: {} })
    } finally { await restarted.ctx.fiber.dispose() }
  } finally { await b.ctx.fiber.dispose() }
})

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
      const operation = metadata['openubmc/operationId']
      if (typeof operation !== 'string') throw new Error('Expected trusted operation metadata')
      calls.push(operation)
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

it('refuses reconciliation while an execute callback is active, then settles without orphaned work', async () => {
  const b = await bench()
  let release!: () => void
  let entered!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const dispatched = new Promise<void>((resolve) => { entered = resolve })
  let pending: Promise<unknown> | undefined
  try {
    const call = vi.fn<() => Promise<unknown>>(async () => response())
    b.register('execute', call)
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    call.mockImplementationOnce(async () => { entered(); await blocked; return response() })
    pending = b.execute('execute', { kind: 'resume', run_id: 'run-owned' })
    await dispatched
    expect((await b.command('/target-action {"kind":"control","command":"reconcile","run_id":"run-owned"}'))?.result.kind).toBe('error')
    expect(call).toHaveBeenCalledTimes(2)
  } finally { release(); await pending; await b.ctx.fiber.dispose() }
})
