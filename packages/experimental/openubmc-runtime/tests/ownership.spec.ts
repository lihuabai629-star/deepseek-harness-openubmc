/** Native Agent authority, opaque Run ownership and fork isolation. */
import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { bench, response } from './harness.ts'

it('reads a retired authorization record without granting native execute', async () => {
  const b = await bench()
  try {
    const commandId = CommandId('legacy-grant')
    b.session.append('command/run', { commandId, name: 'target-authorize', args: 'debug_run', source: { kind: 'user' } })
    b.session.append('command/done', { commandId, kind: 'success' })
    const call = vi.fn(async () => response())
    b.register('execute', call)
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.operations).toEqual([])
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
  } finally { await b.ctx.fiber.dispose() }
})

it('binds multiple Runtime-issued Runs, rejects foreign access and restores authority only in the original Session', async () => {
  const b = await bench()
  let seed
  try {
    let index = 0
    const call = vi.fn(async () => response(`run-${++index}`))
    b.register('execute', call)
    b.register('observe', async () => ({ content: [{ type: 'text', text: 'observation' }] }))
    b.register('workflow.next', call)
    expect((await b.execute('observe')).isError).toBe(false)
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
    await b.command('/target-authorize execute')
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(false)
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(false)
    expect(Object.keys(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.runs)).toEqual(['run-1', 'run-2'])
    expect((await b.execute('execute', { kind: 'resume', run_id: 'foreign' })).isError).toBe(true)
    expect((await b.execute('execute', { kind: 'start', case_id: 'legacy' })).isError).toBe(true)
    expect((await b.execute('workflow.next')).isError).toBe(true)
    const fork = b.ctx.sessions.fork(b.session, undefined, SessionId('fork-agent'))
    const forkAgent = { ...b.agent, id: fork.id, session: fork }
    await b.command('/target-authorize execute', forkAgent)
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-1' }, forkAgent)).isError).toBe(true)
    expect((await b.execute('execute', { kind: 'start' }, forkAgent)).isError).toBe(false)
    await b.command('/target-authorize revoke')
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-1' })).isError).toBe(true)
    await b.command('/target-authorize execute')
    seed = b.session.snapshotEvents()
  } finally { await b.ctx.fiber.dispose() }
  const restored = await bench(seed)
  try {
    restored.register('execute', async () => response('run-1'))
    expect((await restored.execute('execute', { kind: 'resume', run_id: 'run-1' })).isError).toBe(false)
  } finally { await restored.ctx.fiber.dispose() }
})

it('rechecks authority and Run/Gate arguments after middleware and fails closed during unload', async () => {
  const b = await bench()
  try {
    const call = vi.fn(async () => response())
    b.register('execute', call)
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    const mutate = b.ctx.on('mcp/tool-call', (request, next) => { request.arguments = { kind: 'resume', run_id: 'foreign' }; return next() })
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(true)
    mutate()
    const revoke = b.ctx.on('mcp/tool-call', async (_request, next) => { await b.command('/target-authorize revoke'); return next() })
    expect((await b.execute('execute', { kind: 'resume', run_id: 'run-owned' })).isError).toBe(true)
    revoke()
    await b.fiber.dispose()
    expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  } finally { await b.ctx.fiber.dispose() }
})
