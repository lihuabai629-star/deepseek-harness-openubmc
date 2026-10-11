/** Target uncertainty, durable recovery and bounded dispatch through public executors. */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionLogOffset, SessionId, TOOL_OUTCOME_UNKNOWN, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Commands, { CommandId } from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { createMcpToolDefinition, publicToolName } from '@deepseek-ai/dsh-mcp-client'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { expect, it, vi } from 'vitest'
import * as runtime from '../src/index.ts'

const config = { serverName: 'runtime', operationDeadlineSeconds: 10, completionGraceMs: 1000, workflowMaxSteps: 1, evidenceReadLimitBytes: 65536 }

async function bench(seed: readonly SessionEvent[] = []) {
  const ctx = new Context()
  try {
    await ctx.plugin(Sessions)
    await ctx.plugin(Projections)
    await ctx.plugin(Commands)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const runtimeFiber = ctx.plugin(runtime, config)
    await runtimeFiber.await()
    const session = ctx.sessions.create(SessionId('recovery-owner'), { seed: [...seed] })
    const agent: Agent = {
      id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
      send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
      runMaintenance: task => task(new AbortController().signal),
    }
    let unknown = false
    let foreign = false
    let operations: object[] = []
    let frozen: object = { deadline: 10 }
    const call = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/context-runtime', case_id: foreign ? 'foreign' : runtime.sessionCaseId(session.id),
      revision: 1, status: unknown ? 'mutation_outcome_unknown' : 'active', operations,
      mutation_outcome_unknown_operations: unknown ? { mutation: { status: 'mutation_outcome_unknown' } } : {},
      workflow_inputs: frozen,
    } }))
    const register = (rawName: string, provider = call, timeout = 11000) => ctx.tools.register(createMcpToolDefinition(ctx, {
      name: publicToolName('runtime', rawName), rawName, metadataServerName: 'runtime', sessionIdMetadataKey: 'taskId',
      requiredToolCallPolicies: ['openubmc-session-authority'], toolCallTimeoutMs: timeout,
      description: rawName, inputSchema: { type: 'object' }, call: provider,
    }))
    register('case_read')
    register('workflow.next')
    register('workflow.advance')
    const execute = async (rawName: string, args: object = {}, signal = new AbortController().signal) => {
      const callId = ToolCallId(`recovery-${session.seq}`)
      const name = publicToolName('runtime', rawName)
      const callEvent = session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
      const result = await ctx.tools.execute({ name, callId, arguments: args, agent, signal })
      session.append('tool/result', { turn: 1, step: 1,
        message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
        ...(result.meta === undefined ? {} : { meta: result.meta }),
        ...(result.error?.info === undefined ? {} : { error: result.error.info }),
      }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] })
      return result
    }
    const grant = (operation = 'debug_run') => ctx.commands.execute(agent, `/target-authorize ${operation}`, [], new AbortController().signal)
    return { ctx, runtimeFiber, session, agent, execute, register, grant, call,
      caseStatus: (isUnknown: boolean, isForeign = false) => { unknown = isUnknown; foreign = isForeign },
      reportOperations: (items: object[]) => { operations = items },
      freeze: (inputs: object) => { frozen = inputs },
    }
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

it('requires Case and journal reconciliation plus fresh human authority after a lost result, including resume', async () => {
  const test = await bench()
  let events: readonly SessionEvent[] = []
  try {
    const lost = vi.fn(async () => { throw new Error('connection closed') })
    test.register('debug_run', lost)
    await test.grant()
    expect((await test.execute('debug_run')).meta).toMatchObject({ mcp: { dispatchStatus: 'unknown' } })
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')).toMatchObject({ recoveryRequired: true, operations: [] })
    expect((await test.execute('debug_run')).isError).toBe(true)
    expect(lost).toHaveBeenCalledTimes(1)
    await expect(test.grant()).rejects.toThrow('reconcile mutation records')
    test.caseStatus(true)
    expect((await test.execute('case_read')).isError).toBe(false)
    await expect(test.grant()).rejects.toThrow('reconcile mutation records')
    test.caseStatus(false, true)
    await test.execute('case_read')
    await expect(test.grant()).rejects.toThrow('reconcile mutation records')
    events = test.session.snapshotEvents()
  } finally { await test.ctx.fiber.dispose() }
  const resumed = await bench(events)
  try {
    await expect(resumed.grant()).rejects.toThrow('reconcile mutation records')
    await resumed.execute('case_read')
    expect(resumed.ctx.sessionProjections.stateOf(resumed.session, 'openubmc/runtime')?.recoveryRequired).toBe(false)
    expect((await resumed.execute('workflow.next')).isError).toBe(true)
    await resumed.grant('workflow.next')
    expect((await resumed.execute('workflow.next')).isError).toBe(false)
  } finally { await resumed.ctx.fiber.dispose() }
})

it('refuses concurrent or crash-interrupted target work and preserves recovery through synthetic unknown results', async () => {
  const test = await bench()
  try {
    await test.grant('workflow.advance')
    const callId = ToolCallId('unsettled')
    const interrupted = test.session.append('tool/call', { turn: 1, step: 1, callId, name: publicToolName('runtime', 'debug_run'), arguments: '{}' })
    expect((await test.execute('workflow.advance')).isError).toBe(true)
    await expect(test.grant()).rejects.toThrow('reconcile mutation records')
    test.session.append('tool/result', { turn: 1, step: 1,
      error: { name: 'Error', code: TOOL_OUTCOME_UNKNOWN },
      message: createToolResultMessage({ callId, content: [], isError: true }),
    }, { surfaceOp: 'append', sourceEventSeqs: [interrupted.seq] })
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')).toMatchObject({ recoveryRequired: true, pendingCalls: {} })
  } finally { await test.ctx.fiber.dispose() }
})

it('bounds direct deadlines, workflow steps, frozen deadlines and the actual MCP wait budget', async () => {
  const test = await bench()
  try {
    test.register('debug_run')
    await test.grant('debug_run,workflow.advance,workflow.next')
    for (const deadline of [0, -1, 11, '10', Infinity]) expect((await test.execute('debug_run', { deadline })).isError).toBe(true)
    expect((await test.execute('debug_run', { deadline: 2 })).isError).toBe(false)
    expect((await test.execute('workflow.next')).isError).toBe(true)
    for (const max_steps of [0, 2, 1.5, '1']) expect((await test.execute('workflow.advance', { max_steps })).isError).toBe(true)
    expect((await test.execute('workflow.advance', { workflow: { debug: { deadline: 11 } } })).isError).toBe(true)
    expect((await test.execute('workflow.advance', { deadline: 11 })).isError).toBe(true)
    expect((await test.execute('workflow.advance')).isError).toBe(false)
    test.freeze({ deadline: 11 })
    await test.execute('case_read')
    expect((await test.execute('workflow.next')).isError).toBe(true)
    test.freeze({ deadline: 'invalid' })
    await test.execute('case_read')
    expect((await test.execute('workflow.next')).isError).toBe(true)
    test.freeze({ deadline: 5, workflow: { debug: { deadline: 8 } } })
    await test.execute('case_read')
    expect((await test.execute('workflow.next')).isError).toBe(false)
    expect((await test.execute('workflow.advance')).isError).toBe(false)
    expect((await test.execute('workflow.next')).isError).toBe(true)
    test.register('upgrade_run', test.call, 10000)
    await test.grant('upgrade_run')
    expect((await test.execute('upgrade_run')).isError).toBe(true)
  } finally { await test.ctx.fiber.dispose() }
})

it('requires recovery when cancellation arrives with the provider success', async () => {
  const test = await bench()
  try {
    const controller = new AbortController()
    test.register('debug_run', vi.fn(async () => { controller.abort(); return test.call() }))
    await test.grant()
    const result = await test.execute('debug_run', {}, controller.signal)
    expect(result.error?.info?.code).toBe('ABORTED')
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')).toMatchObject({ recoveryRequired: true, operations: [] })
    await expect(test.grant()).rejects.toThrow('reconcile mutation records')
  } finally { await test.ctx.fiber.dispose() }
})

it('keeps delivery inference unchanged while bounding existing workflow sections', async () => {
  const test = await bench()
  try {
    await test.grant('workflow.advance')
    expect((await test.execute('workflow.advance', { intent: 'diagnose-and-fix', workflow: { debug: { deadline: 5 } } })).isError).toBe(false)
    expect(test.call).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: { debug: { deadline: 5 } } }), expect.anything(), expect.anything(),
    )
  } finally { await test.ctx.fiber.dispose() }
})

it('authorizes only one exact original mutation after its unknown journal is read', async () => {
  const test = await bench()
  try {
    let recovered = false
    const provider = vi.fn(async () => { if (!recovered) throw new Error('lost mutation response'); return test.call() })
    test.register('upgrade_run', provider)
    await test.grant('upgrade_run')
    const original = { artifact_path: '/tmp/test.hpm', artifact_sha256: 'a'.repeat(64) }
    await test.execute('upgrade_run', original)
    const callId = Object.keys(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')!.uncertainCalls)[0]!
    const reconcile = () => test.ctx.commands.execute(test.agent, `/target-reconcile ${callId}`, [], new AbortController().signal)
    await expect(reconcile()).rejects.toThrow('Read the current Case')
    test.caseStatus(true)
    test.reportOperations([{ operation_id: callId, operation: 'upgrade_run', status: 'mutation_outcome_unknown' }, { operation_id: 'external-unknown', status: 'mutation_outcome_unknown' }])
    await test.execute('case_read')
    await reconcile()
    expect((await test.execute('upgrade_run', { ...original, artifact_path: '/tmp/other.hpm' })).isError).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
    // A rejected altered request does not consume permission for the original operation.
    recovered = true
    expect((await test.execute('upgrade_run', original)).isError).toBe(false)
    expect(provider).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { 'dsh/openubmc-operation-id': callId })
    expect((await test.execute('upgrade_run', original)).isError).toBe(true)
    await expect(test.grant('upgrade_run')).rejects.toThrow('reconcile mutation records')
  } finally { await test.ctx.fiber.dispose() }
})

it('cancels and drains native inspection on plugin teardown without appending late observations', async () => {
  const test = await bench()
  let finish!: (value: { content: { type: string; text: string }[] }) => void
  const started = vi.fn()
  test.ctx.tools.register(createMcpToolDefinition(test.ctx, { name: publicToolName('runtime', 'evidence_read'), rawName: 'evidence_read', metadataServerName: 'runtime', sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], description: 'inspect', inputSchema: { type: 'object' }, call: async () => {
    started()
    return new Promise<{ content: { type: string; text: string }[] }>((resolve) => { finish = resolve })
  } }))
  const pending = test.ctx.commands.execute(test.agent, '/evidence evidence-1', [], new AbortController().signal)
  await vi.waitFor(() => { expect(started).toHaveBeenCalled() })
  const closed = test.ctx.fiber.dispose()
  finish({ content: [{ type: 'text', text: 'late evidence' }] })
  await Promise.allSettled([pending, closed])
  expect(test.session.snapshotEvents().some(event => event.type === 'openubmc/inspection')).toBe(false)
})

it('logs native Case and bounded evidence reads, retaining failure without granting execution', async () => {
  const test = await bench()
  try {
    const command = (line: string) => test.ctx.commands.execute(test.agent, line, [], new AbortController().signal)
    const read = await command('/case-refresh')
    expect(read?.result).toMatchObject({ kind: 'success', text: 'ok' })
    expect(test.session.snapshotEvents().filter(event => event.type === 'openubmc/inspection')).toHaveLength(1)
    const evidence = vi.fn(async () => ({ isError: true, content: [{ type: 'text', text: 'Evidence unavailable' }] }))
    test.ctx.tools.register(createMcpToolDefinition(test.ctx, { name: publicToolName('runtime', 'evidence_read'), rawName: 'evidence_read', metadataServerName: 'runtime', sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], description: 'evidence', inputSchema: { type: 'object' }, call: evidence }))
    await expect(command('/evidence ../foreign')).rejects.toThrow('Usage:')
    expect((await command('/evidence evidence-1'))?.result).toEqual({ kind: 'error', text: 'Error: Evidence unavailable' })
    expect(evidence).toHaveBeenCalledWith({ evidence_id: 'evidence-1', limit: config.evidenceReadLimitBytes, case_id: runtime.sessionCaseId(test.session.id) }, expect.anything(), {})
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')?.operations).toEqual([])
    expect(test.session.snapshotEvents().filter(event => event.type === 'openubmc/inspection')).toHaveLength(2)
  } finally { await test.ctx.fiber.dispose() }
})

it('qualifies only effective frozen workflow budgets and restores pending command/call checkpoints', async () => {
  const test = await bench()
  try {
    await test.grant('workflow.advance,workflow.next')
    expect((await test.execute('workflow.advance', { workflow: { debug: {} } })).isError).toBe(false)
    for (const strategy of ['build-upgrade', 'live-patch', 'source-only', 'future']) {
      test.freeze({ delivery_strategy: strategy, deadline: 5,
        workflow: { debug: { deadline: 3 }, verification: {}, upgrade: { deadline: 4 }, live_patch: { deadline: 4 } } })
      await test.execute('case_read')
      expect((await test.execute('workflow.next')).isError).toBe(false)
    }
    test.freeze({ delivery_strategy: 'source-only', workflow: {} })
    await test.execute('case_read')
    expect((await test.execute('workflow.next')).isError).toBe(true)
    test.session.append('command/run', { commandId: CommandId('pending-grant'), name: 'target-authorize', args: 'debug_run', source: { kind: 'user' } })
    test.session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('pending-runtime'), name: publicToolName('runtime', 'debug_run'), arguments: '{"deadline":2}' })
    const checkpoint = test.ctx.sessionProjections.checkpoint(test.session)
    const restored = test.ctx.sessionProjections.restore(
      checkpoint, [], SessionLogOffset(test.session.seq), test.session.header, test.session.inheritedEventCount,
    )
    expect(restored.checkpoint['openubmc/runtime']?.val).toMatchObject({ pendingGrants: { 'pending-grant': 'debug_run' }, pendingCalls: { 'pending-runtime': { operation: 'debug_run' } } })
    test.session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('malformed-json'), name: publicToolName('runtime', 'debug_run'), arguments: '{' })
    test.session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('malformed-args'), name: publicToolName('runtime', 'debug_run'), arguments: '[]' })
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')?.pendingCalls).not.toHaveProperty('malformed-json')
    test.session.append('openubmc/inspection', { commandId: CommandId('external-cancel'), message: { isError: true }, meta: { mcp: { serverName: 'runtime', toolName: 'upgrade_run', structuredContent: { agent_envelope: { status: 'cancelled' } } } } })
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')?.recoveryRequired).toBe(true)
  } finally { await test.ctx.fiber.dispose() }
})

it('refuses recovery that appears during final dispatch and keeps non-started workflows from invalidating budgets', async () => {
  const test = await bench()
  try {
    test.register('debug_run')
    await test.grant('debug_run')
    const change = test.ctx.on('mcp/tool-call', (_request, next) => {
      test.session.append('openubmc/inspection', { commandId: CommandId('uncertain'), message: { isError: true }, meta: { mcp: { serverName: 'runtime', toolName: 'debug_run', structuredContent: { status: 'mutation_outcome_unknown' } } } })
      return next()
    })
    expect((await test.execute('debug_run')).isError).toBe(true)
    expect(test.call).not.toHaveBeenCalled()
    change()
    await test.execute('case_read')
    const notStarted = test.session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('not-started'), name: publicToolName('runtime', 'workflow.advance'), arguments: '{}' })
    test.session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: ToolCallId('not-started'), content: [], isError: false }), meta: { mcp: { serverName: 'runtime', toolName: 'workflow.advance', dispatchStatus: 'not-started' } } }, { surfaceOp: 'append', sourceEventSeqs: [notStarted.seq] })
    expect(test.ctx.sessionProjections.stateOf(test.session, 'openubmc/runtime')?.workflowDeadlineSeconds).toBe(10)
    const definition = { name: publicToolName('runtime', 'evidence_read'), description: 'Unavailable evidence', parameters: { type: 'object' }, output: { schema: { type: 'string' as const }, render: () => [{ type: 'text' as const, text: 'unavailable' }] }, execute: async () => 'unavailable' }
    test.ctx.tools.register(definition)
    const result = await test.ctx.commands.execute(test.agent, '/evidence evidence-1', [], new AbortController().signal)
    expect(result?.result.kind).toBe('success')
    expect(test.session.snapshotEvents().findLast(event => event.type === 'openubmc/inspection')?.data).toMatchObject({ message: { isError: false } })
  } finally { await test.ctx.fiber.dispose() }
})

it('cancels inspection when its command owner is disposed at command admission', async () => {
  const test = await bench()
  let closing: Promise<void> | undefined
  try {
    test.ctx.on('session/event', (_session, event) => {
      if (event.type === 'command/run' && event.data.name === 'case-refresh') closing = test.runtimeFiber.dispose()
    })
    await expect(test.ctx.commands.execute(test.agent, '/case-refresh', [], new AbortController().signal)).resolves.toMatchObject({ result: { kind: 'error', text: 'openUBMC inspection cancelled.' } })
    await closing
    expect(test.call).not.toHaveBeenCalled()
    expect(test.session.snapshotEvents().some(event => event.type === 'openubmc/inspection')).toBe(false)
  } finally { await test.ctx.fiber.dispose() }
})
