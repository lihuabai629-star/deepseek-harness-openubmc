/** Durable admission, per-Run controls and dispatch limits. */
import { expect, it, vi } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createMcpToolDefinition, publicToolName } from '@deepseek-ai/dsh-mcp-client'
import { bench, response } from './harness.ts'

it('projects read-only and scoped continuations independently and restores the same controls from a checkpoint', async () => {
  const b = await bench()
  try {
    let run = 0
    b.register('execute', async () => response(`run-${++run}`))
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    await b.execute('execute', { kind: 'start', target: '192.0.2.1', intent: 'diagnosis-only' })
    const view = () => b.ctx.sessionProjections.snapshot(b.session).values['openubmc/runtime']
    expect(view()).toMatchObject({ authorized: true, executableRunIds: ['run-1', 'run-2'] })
    await b.command('/target-authorize revoke')
    expect(view()).toMatchObject({ authorized: false, executableRunIds: ['run-2'] })
    await b.command('/target-authorize execute 192.0.2.1 diagnose-and-fix live-patch')
    await b.execute('execute', { kind: 'start', target: '192.0.2.1', intent: 'diagnose-and-fix', delivery_strategy: 'live-patch' })
    expect(view()).toMatchObject({ authorized: true, executableRunIds: ['run-2', 'run-3'] })
    await b.command('/target-authorize execute 192.0.2.2 diagnose-and-fix')
    expect(view()).toMatchObject({ executableRunIds: ['run-2', 'run-3'] })
    const restored = b.ctx.sessionProjections.restore(b.ctx.sessionProjections.checkpoint(b.session), [],
      SessionLogOffset(b.session.seq), b.session.header, b.session.inheritedEventCount)
    expect(restored.snapshot.values['openubmc/runtime']).toEqual(view())
    await b.command('/target-authorize revoke')
    expect(view()).toMatchObject({ executableRunIds: ['run-2'] })
  } finally { await b.ctx.fiber.dispose() }
})

it('ignores malformed recorded actions and unmatched authorization without granting or dispatching them', async () => {
  const b = await bench()
  try {
    for (const [index, args] of ['{', '[]', '{"kind":"start"}'].entries()) {
      const commandId = CommandId(`malformed-command-${index}`)
      b.session.append('command/run', { commandId, name: 'target-action', args, source: { kind: 'user' } })
      b.session.append('command/done', { commandId, kind: 'error' })
    }
    for (const [index, args] of ['{', '[]'].entries()) {
      b.session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId(`malformed-call-${index}`),
        name: publicToolName('runtime', 'execute'), arguments: args })
    }
    b.session.append('openubmc/authorization', { callId: ToolCallId('orphaned'), arguments: { kind: 'start' } })
    const callId = ToolCallId('changed-start')
    b.session.append('tool/call', { turn: 1, step: 1, callId, name: publicToolName('runtime', 'execute'),
      arguments: '{"kind":"start","target":"192.0.2.1","intent":"diagnose-and-fix"}' })
    b.session.append('openubmc/authorization', { callId, arguments: { kind: 'start', target: '192.0.2.2', intent: 'diagnose-and-fix', deadline: 10 } })
    const failed = CommandId('failed-authorization')
    b.session.append('command/run', { commandId: failed, name: 'target-authorize', args: 'execute', source: { kind: 'user' } })
    b.session.append('command/done', { commandId: failed, kind: 'error' })
    expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')).toMatchObject({
      operations: [], approvedCalls: {}, pendingCalls: { 'changed-start': { arguments: { target: '192.0.2.1' } } },
    })
    expect(Object.keys(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.pendingCalls)).toEqual(['changed-start'])
  } finally { await b.ctx.fiber.dispose() }
})

it('denies caller waits that the MCP transport cannot cover and rejects start identity injection', async () => {
  for (const timeout of [undefined, 10000]) {
    const b = await bench()
    try {
      const call = vi.fn(async () => response())
      const name = publicToolName('runtime', 'execute')
      b.ctx.tools.register(createMcpToolDefinition(b.ctx, { name, rawName: 'execute', metadataServerName: 'runtime',
        sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'],
        ...(timeout === undefined ? {} : { toolCallTimeoutMs: timeout }), description: 'bounded execution', inputSchema: { type: 'object' }, call }))
      await b.command('/target-authorize execute')
      expect((await b.execute('execute', { kind: 'start' })).isError).toBe(true)
      expect(call).not.toHaveBeenCalled()
    } finally { await b.ctx.fiber.dispose() }
  }
  const b = await bench()
  try {
    const call = vi.fn(async () => response())
    b.register('execute', call)
    await b.command('/target-authorize execute')
    expect((await b.execute('execute', { kind: 'start', run_id: 'chosen-by-model' })).isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
  } finally { await b.ctx.fiber.dispose() }
})

it('requires trusted Session metadata only for the configured Runtime namespace', async () => {
  const b = await bench()
  try {
    const call = vi.fn(async () => response())
    const name = publicToolName('runtime', 'execute')
    b.register('execute', call)
    const anonymous = await b.ctx.tools.execute({ name, callId: ToolCallId('anonymous'), arguments: { kind: 'start' }, signal: new AbortController().signal })
    expect(anonymous.isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
    const otherName = publicToolName('unrelated', 'execute')
    b.ctx.tools.register(createMcpToolDefinition(b.ctx, { name: otherName, rawName: 'execute', metadataServerName: 'unrelated',
      description: 'unrelated MCP server', inputSchema: { type: 'object' }, call }))
    const other = await b.ctx.tools.execute({ name: otherName, callId: ToolCallId('other-server'), arguments: {}, signal: new AbortController().signal })
    expect(other.isError).toBe(false)
    expect(call).toHaveBeenCalledTimes(1)
  } finally { await b.ctx.fiber.dispose() }
})

it('cancels an owned Incident only with the latest Incident identity', async () => {
  const b = await bench()
  try {
    const incident = { ...response(), structuredContent: { ...response().structuredContent, state: 'incident',
      incident: { incident_id: 'incident-owned' } } }
    b.register('execute', async () => incident)
    await b.command('/target-authorize execute')
    await b.execute('execute', { kind: 'start' })
    expect((await b.execute('execute', { kind: 'control', run_id: 'run-owned', command: 'cancel', incident_id: 'incident-owned' })).isError).toBe(false)
    await expect(b.command('/target-reconcile missing-start')).rejects.toThrow('unacknowledged start')
  } finally { await b.ctx.fiber.dispose() }
})
