/** Session-owned openUBMC observe/execute dispatch. @module */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { CommandDefinitionId, CommandId } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset, TOOL_OUTCOME_UNKNOWN, type SessionId } from '@deepseek-ai/dsh-session'
import { TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import { runTurnSchema } from '@deepseek-ai/dsh-experimental-openubmc-cases/agent'
import type { OpenUbmcRunId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { publicToolName, type McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { OpenUbmcRuntimeState } from './types.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'openubmc-runtime'
/** Durable authority and native human commands. */
export const inject = ['commands', 'sessionProjections', 'tools']

/** Caller wait budgets for the Agent gateway. */
export interface Config {
  /** Exact MCP namespace protected by this adapter. */
  serverName: string
  /** Bounded execute wait in seconds; Runtime owns long-running work. */
  operationDeadlineSeconds: number
  /** Bounded observation wait in seconds. */
  observationDeadlineSeconds: number
  /** MCP completion allowance beyond the caller wait, in milliseconds. */
  completionGraceMs: number
}
/** Runtime execute waits are limited to 120 seconds by the Agent protocol. */
export const Config: z<Config> = z.object({
  serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/),
  operationDeadlineSeconds: z.number().required().min(1).max(120),
  observationDeadlineSeconds: z.number().required().min(1).max(2_147_483),
  completionGraceMs: z.number().required().min(1).max(2_147_483_647),
})
const jsonObject = schema.record(schema.string(), schema.json())
const callSchema = schema.object({ arguments: jsonObject, operationId: schema.string().transform(ToolCallId) })
const metadataSchema = schema.object({ mcp: schema.object({
  serverName: schema.string(), toolName: schema.string(),
  dispatchStatus: schema.enum(['unknown', 'not-started']).optional(), structuredContent: jsonObject.optional(),
}) })
const actionSchema = schema.discriminatedUnion('kind', [
  schema.object({ kind: schema.literal('start') }).loose(),
  schema.object({ kind: schema.literal('resume'), run_id: schema.string().min(1) }).loose(),
  schema.object({ kind: schema.literal('respond'), run_id: schema.string().min(1), gate_id: schema.string().min(1),
    gate_version: schema.number().int().positive(), schema_digest: schema.string().min(1) }).loose(),
  schema.object({ kind: schema.literal('control'), run_id: schema.string().min(1), command: schema.enum(['reconcile', 'cancel']) }).loose(),
])
const continuationSchema = actionSchema.refine(action => action.kind !== 'start', 'Native actions must continue an existing Run.')
const runtimeOwned = ['case_id', 'command_id', 'authorization', 'workflow', 'epoch', 'task_id', 'operation_id']

function nativeCallId(commandId: CommandId): ToolCallId {
  return ToolCallId(`command:${commandId}`)
}

/** Namespace opaque model call ids by the trusted Session and bound their wire length. */
function operationId(request: McpToolCall, callId: ToolCallId): string {
  return `dsh-${createHash('sha256').update(JSON.stringify([request.execution.agent?.session.id, callId])).digest('hex')}`
}

/** Parse the Session's human grant without accepting retired tool names. */
function grant(input: string): string[] {
  if (input === 'revoke') return []
  if (input !== 'execute') throw new Error('Usage: /target-authorize execute | revoke')
  return ['execute']
}

/** Resolve a caller wait; this does not change a domain operation deadline. */
function budget(request: McpToolCall, config: Config): Record<string, unknown> {
  const maximum = request.toolName === 'execute' ? config.operationDeadlineSeconds : config.observationDeadlineSeconds
  const deadline = request.arguments.deadline ?? maximum
  if (typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline <= 0 || deadline > maximum) {
    throw new Error('The requested Runtime caller wait exceeds the configured limit.')
  }
  const required = deadline * 1000 + config.completionGraceMs
  if (request.toolCallTimeoutMs === undefined || request.toolCallTimeoutMs < required) {
    throw new Error(`MCP wait budget must be at least ${required} ms for this Runtime request.`)
  }
  return { ...request.arguments, deadline }
}

/** Validate authority immediately before provider dispatch, after other middleware. */
function authorize(request: McpToolCall, state: OpenUbmcRuntimeState, config: Config): void {
  if (runtimeOwned.some(key => Object.hasOwn(request.arguments, key))) throw new Error('Runtime-owned execution fields are not accepted by the Agent interface.')
  if (request.toolName === 'observe') { request.arguments = budget(request, config); return }
  const action = actionSchema.parse(request.arguments)
  const replayId = state.reconcileCallId
  const original = replayId === null ? undefined : state.uncertainCalls[replayId] ?? state.pendingCalls[replayId]
  if (original !== undefined) {
    if (Object.keys(state.pendingCalls).some(id => id !== request.execution.callId && id !== replayId)) {
      throw new Error('Another execute call is still pending; wait for its settlement before replay.')
    }
    const expected = budget({ ...request, arguments: original.arguments }, config)
    if (!isDeepStrictEqual(budget(request, config), expected)) throw new Error('Recovery requires the exact original start arguments.')
    request.arguments = expected
    request.metadata['openubmc/operationId'] = operationId(request, original.operationId)
    return
  }
  const ownRun = action.kind === 'start' ? undefined : state.runs[brandString<OpenUbmcRunId>(action.run_id)]
  if (action.kind !== 'start' && ownRun === undefined) throw new Error('The requested Run does not belong to this Session.')
  if (!state.operations.includes('execute')) throw new Error('Target execution requires a current-session human grant for execute.')
  if (action.kind === 'start' && Object.hasOwn(action, 'run_id')) throw new Error('Runtime assigns the Run identity for start.')
  if (action.kind === 'respond' || action.kind === 'control' && action.command === 'cancel' && ownRun?.incident == null) {
    const binding = schema.object({
      gate_id: schema.string(), gate_version: schema.number().int(), schema_digest: schema.string(),
    }).parse(action)
    const gate = jsonObject.safeParse(ownRun?.gate)
    if (!gate.success || binding.gate_id !== gate.data.gate_id || binding.gate_version !== gate.data.gate_version
      || binding.schema_digest.replace(/^sha256:/, '') !== schema.string().parse(gate.data.schema_digest).replace(/^sha256:/, '')) {
      throw new Error('The response must bind the latest observed Gate id, version and schema digest.')
    }
  }
  if (action.kind === 'control' && action.command === 'cancel' && ownRun?.incident !== null && ownRun?.incident !== undefined) {
    const incident = jsonObject.parse(ownRun.incident)
    if (action.incident_id !== incident.incident_id) throw new Error('Cancellation must bind the latest observed Incident.')
  }
  const unresolved = [...Object.entries(state.pendingCalls), ...Object.entries(state.uncertainCalls)]
    .filter(([id]) => id !== request.execution.callId)
  if (unresolved.length > 0 && !(action.kind === 'control' && action.command === 'reconcile'
    && unresolved.every(([, call]) => call?.arguments.run_id === action.run_id))) {
    throw new Error('The prior execute outcome is unknown. Reconcile the same Run before further execution.')
  }
  request.arguments = budget(request, config)
}

/**
 * Bind Runtime-issued Runs to trusted Sessions and retain native operation ids.
 * @param ctx - MCP dispatch, command and projection services.
 * @param config - Agent gateway namespace and caller wait limits.
 */
export function apply(ctx: Context, config: Config): void {
  const activeCalls = new Map<SessionId, Set<ToolCallId>>()
  const stateSchema: schema.ZodType<OpenUbmcRuntimeState> = schema.object({
    inheritedEventCount: schema.number().int().nonnegative().transform(SessionLogOffset),
    operations: schema.array(schema.string()), pendingGrants: schema.record(schema.string().transform(CommandId), schema.string()),
    runs: schema.record(schema.string().transform(value => brandString<OpenUbmcRunId>(value)), jsonObject),
    pendingCalls: schema.record(schema.string().transform(ToolCallId), callSchema),
    uncertainCalls: schema.record(schema.string().transform(ToolCallId), callSchema),
    reconcileCallId: schema.string().transform(ToolCallId).nullable(),
  })
  ctx.sessionProjections.register({
    key: 'openubmc/runtime', stateVersion: 4, stateSchema,
    init: (_header, inheritedEventCount) => ({ inheritedEventCount, operations: [], pendingGrants: {},
      runs: {}, pendingCalls: {}, uncertainCalls: {}, reconcileCallId: null }),
    wire: {
      viewSchema: schema.object({ authorized: schema.boolean(), pending: schema.number().int().nonnegative(),
        uncertain: schema.number().int().nonnegative() }),
      view: state => ({ authorized: state.operations.includes('execute'), pending: Object.keys(state.pendingCalls).length,
        uncertain: Object.keys(state.uncertainCalls).length }),
    },
    apply(state, event) {
      if (event.seq < state.inheritedEventCount) return state
      if (event.type === 'command/run' && event.data.name === 'target-action') {
        let input: unknown
        try { input = JSON.parse(event.data.args ?? '') } catch (_error) {
          // Malformed native input never enters the execution pipeline.
          return state
        }
        const parsed = continuationSchema.safeParse(input)
        if (!parsed.success) return state
        const id = nativeCallId(event.data.commandId)
        return { ...state, pendingCalls: { ...state.pendingCalls, [id]: { arguments: jsonObject.parse(parsed.data), operationId: id } } }
      }
      if (event.type === 'tool/call' && event.data.name === publicToolName(config.serverName, 'execute')) {
        let input: unknown
        try { input = JSON.parse(event.data.arguments) } catch (_error) {
          // Invalid model JSON cannot dispatch to the provider.
          return state
        }
        const parsed = jsonObject.safeParse(input)
        if (!parsed.success) return state
        return { ...state, pendingCalls: { ...state.pendingCalls, [event.data.callId]: {
          arguments: parsed.data, operationId: state.reconcileCallId ?? event.data.callId,
        } } }
      }
      if (event.type === 'tool/result' || event.type === 'openubmc/inspection') {
        const id = event.type === 'tool/result' ? event.data.message.toolCallId : nativeCallId(event.data.commandId)
        const errorCode = event.type === 'tool/result' ? event.data.error?.code : undefined
        const recorded = state.pendingCalls[id]
        if (recorded === undefined) return state
        const replayId = state.reconcileCallId
        const original = replayId === null ? undefined : state.uncertainCalls[replayId] ?? state.pendingCalls[replayId]
        const comparable = (args: Record<string, unknown>) => ({ ...args, deadline: args.deadline ?? config.operationDeadlineSeconds })
        const pending = original !== undefined && isDeepStrictEqual(comparable(recorded.arguments), comparable(original.arguments))
          ? { ...recorded, operationId: original.operationId } : recorded
        const { [id]: _settled, ...pendingCalls } = state.pendingCalls
        const metadata = metadataSchema.safeParse(event.data.meta)
        const mcp = metadata.success && metadata.data.mcp.serverName === config.serverName && metadata.data.mcp.toolName === 'execute' ? metadata.data.mcp : undefined
        if (mcp?.dispatchStatus === 'not-started') return { ...state, pendingCalls }
        const turn = runTurnSchema.safeParse(mcp?.structuredContent)
        const failure = schema.object({ schema: schema.literal('openubmc.target-runtime.v1/agent-gateway-v1/turn'),
          run_id: schema.literal(''), state: schema.literal('failed'), error: schema.object({ code: schema.string() }),
        }).safeParse(mcp?.structuredContent)
        const rejected = event.data.message.isError && failure.success
          && ['AgentGatewayError', 'AgentPreflightError', 'GatePreflightError', 'GateSchemaViolation',
            'GateConflict', 'ReferenceViolation', 'ScopeViolation', 'AgentBudgetError', 'CommandConflict'].includes(failure.data.error.code)
        const uncertain = mcp?.dispatchStatus === 'unknown' || errorCode === TOOL_OUTCOME_UNKNOWN
          || errorCode === TOOL_ABORTED || !turn.success && !rejected
          || mcp === undefined || turn.success && pending.arguments.kind !== 'start' && pending.arguments.run_id !== turn.data.run_id
        if (uncertain) return { ...state, pendingCalls, reconcileCallId: null,
          uncertainCalls: { ...state.uncertainCalls, [pending.operationId]: pending } }
        let runs = state.runs
        let uncertainCalls = { ...state.uncertainCalls }
        if (turn.success && (pending.arguments.kind === 'start' || pending.arguments.run_id === turn.data.run_id)) {
          const runId = brandString<OpenUbmcRunId>(turn.data.run_id)
          if (pending.arguments.kind === 'start' || runs[runId] !== undefined) runs = { ...runs, [runId]: turn.data }
          if (pending.arguments.kind === 'control' && pending.arguments.command === 'reconcile') {
            uncertainCalls = Object.fromEntries(Object.entries(uncertainCalls).filter(([, call]) => call?.arguments.run_id !== runId))
          }
        }
        if (turn.success) {
          const { [pending.operationId]: _recovered, ...unsettled } = uncertainCalls
          uncertainCalls = unsettled
        }
        else if (pending.operationId !== id) {
          uncertainCalls[pending.operationId] = state.uncertainCalls[pending.operationId]
            ?? state.pendingCalls[pending.operationId] ?? pending
        }
        const { [pending.operationId]: _original, ...unsettledCalls } = pendingCalls
        const remaining = turn.success && pending.arguments.kind === 'control' && pending.arguments.command === 'reconcile'
          ? Object.fromEntries(Object.entries(unsettledCalls).filter(([, call]) => call?.arguments.run_id !== turn.data.run_id))
          : unsettledCalls
        return { ...state, runs, pendingCalls: remaining, uncertainCalls, reconcileCallId: null }
      }
      if (event.type === 'command/run' && ['target-authorize', 'target-reconcile'].includes(event.data.name) && event.data.args !== undefined) {
        return { ...state, pendingGrants: { ...state.pendingGrants, [event.data.commandId]:
          event.data.name === 'target-reconcile' ? `reconcile:${event.data.args.trim()}` : event.data.args.trim() } }
      }
      if (event.type !== 'command/done') return state
      const { [event.data.commandId]: input, ...pendingGrants } = state.pendingGrants
      if (input === undefined || event.data.kind !== 'success') return { ...state, pendingGrants }
      return input.startsWith('reconcile:') ? { ...state, pendingGrants, reconcileCallId: ToolCallId(input.slice(10)) }
        : { ...state, pendingGrants, operations: input === 'execute' ? ['execute'] : [], reconcileCallId: null }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime/action'), name: 'target-action',
    description: 'Submit an explicit continuation to an owned openUBMC Run', input: { hint: '<execute action JSON>' },
    handler: async (invocation) => {
      const action = continuationSchema.parse(JSON.parse(invocation.rawInput))
      const result = await ctx.tools.execute({ name: publicToolName(config.serverName, 'execute'),
        callId: nativeCallId(invocation.commandId), arguments: action, agent: invocation.agent, signal: invocation.signal })
      const event = invocation.agent.session.append('openubmc/inspection', { commandId: invocation.commandId,
        message: { isError: result.isError }, ...(result.meta === undefined ? {} : { meta: result.meta }) })
      const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      return result.isError ? { kind: 'error', text } : { kind: 'success', text, sourceEventSeq: event.seq }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime'), name: 'target-authorize',
    description: 'Authorize Agent execute for this Session', input: { hint: 'execute | revoke' },
    handler: (invocation) => {
      const operations = grant(invocation.rawInput.trim())
      return { kind: 'success', text: operations.length === 0 ? 'Target execution authority revoked for this Session.'
        : 'Target execution authorized for this Session: execute.' }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime/reconcile'), name: 'target-reconcile',
    description: 'Permit one exact replay of an unacknowledged start', input: { hint: '<original-call-id>' },
    handler: (invocation) => {
      const id = ToolCallId(invocation.rawInput.trim())
      const state = ctx.sessionProjections.stateOf(invocation.agent.session, 'openubmc/runtime')
      const original = state?.uncertainCalls[id] ?? state?.pendingCalls[id]
      if (activeCalls.get(invocation.agent.session.id)?.has(id)) throw new Error('The original start is still running; wait for its settlement.')
      if (original?.arguments.kind !== 'start') throw new Error('Only an unacknowledged start can be replayed; use execute control reconcile for an existing Run.')
      return { kind: 'success', text: `Reconciliation authorized once for ${id}, preserving its Runtime operation identity.` }
    },
  })
  ctx.on('mcp/tool-call', async (request, next) => {
    if (request.serverName !== config.serverName) return next()
    const session = request.execution.agent?.session
    if (session === undefined || request.sessionIdMetadataKey !== 'taskId') throw new Error('openUBMC requires a trusted Session and sessionIdMetadataKey: taskId.')
    if (!['observe', 'execute'].includes(request.toolName)) throw new Error(`Unsupported openUBMC Agent operation: ${request.toolName}.`)
    const check = (): void => {
      const current = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
      if (current === undefined) throw new Error('openUBMC authority projection is not registered.')
      const { ['codex/taskId']: _codexTask, task_id: _taskId, threadId: _threadId, ...metadata } = request.metadata
      request.metadata = metadata
      request.metadata['openubmc/operationId'] = operationId(request, request.execution.callId)
      authorize(request, current, config)
      if (request.toolName === 'execute' && request.arguments.kind === 'control' && request.arguments.command === 'reconcile'
        && [...activeCalls.get(session.id) ?? []].some(id => id !== request.execution.callId)) {
        throw new Error('An execute call is still running; wait for its settlement before reconciliation.')
      }
    }
    check()
    request.appliedPolicies.set('openubmc-session-authority', check)
    if (request.toolName === 'observe') return next()
    const active = activeCalls.get(session.id) ?? new Set<ToolCallId>()
    activeCalls.set(session.id, active)
    active.add(request.execution.callId)
    try { return await next() } finally {
      active.delete(request.execution.callId)
      if (active.size === 0) activeCalls.delete(session.id)
    }
  })
}
