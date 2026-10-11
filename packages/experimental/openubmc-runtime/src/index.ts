/** Session-owned openUBMC execution over the existing MCP bridge. @module */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { CommandDefinitionId, CommandId, type CommandResult } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset, TOOL_OUTCOME_UNKNOWN, type SessionId } from '@deepseek-ai/dsh-session'
import type { OpenUbmcCaseId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { publicToolName, type McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { OpenUbmcRuntimeState } from './types.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'openubmc-runtime'
/** Human command registry used to record explicit target authority. */
export const inject = ['commands', 'sessionProjections', 'tools']

/** Exact Runtime namespace protected by this adapter. */
export interface Config {
  /** MCP server configured with trusted Session metadata. */
  serverName: string
  /** Maximum domain deadline admitted for a device operation, in seconds. */
  operationDeadlineSeconds: number
  /** Additional MCP wait beyond the bounded domain work, in milliseconds. */
  completionGraceMs: number
  /** Maximum automatic Runtime operations in one workflow request (protocol limit 64). */
  workflowMaxSteps: number
  /** Maximum bytes requested by a native evidence inspection. */
  evidenceReadLimitBytes: number
}
/** Required source selection; unknown Runtime tools fail closed. */
export const Config: z<Config> = z.object({
  serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/),
  operationDeadlineSeconds: z.number().required().min(1).max(2_147_483),
  completionGraceMs: z.number().required().min(1).max(2_147_483_647),
  workflowMaxSteps: z.number().required().step(1).min(1).max(64),
  evidenceReadLimitBytes: z.number().required().step(1).min(1).max(1048576),
})

const targetOperations = new Set(['debug_run', 'debug_collect', 'live_patch_run', 'upgrade_run', 'workflow.advance', 'workflow.next'])
const caseOperations = new Set(['case_read', 'evidence_read', 'case_close', 'case_forget', 'phase_record'])
const resultMetadata = schema.object({ mcp: schema.object({
  serverName: schema.string(), toolName: schema.string(),
  dispatchStatus: schema.enum(['unknown', 'not-started']).optional(),
  structuredContent: schema.record(schema.string(), schema.json()).optional(),
}) })
const settledCase = schema.object({
  schema: schema.literal('openubmc.target-runtime.v1/context-runtime'),
  case_id: schema.string(), status: schema.string(),
  operations: schema.array(schema.object({ status: schema.string(),
    operation_id: schema.string().transform(ToolCallId).optional(),
    operation: schema.string().optional() }).loose()),
  mutation_outcome_unknown_operations: schema.record(schema.string(), schema.json()),
  workflow_inputs: schema.record(schema.string(), schema.json()),
})

/** Resolve bounded domain arguments and validate the actual provider wait. */
function resolveBudget(request: McpToolCall, config: Config, state: OpenUbmcRuntimeState): Record<string, unknown> {
  const workflow = request.toolName.startsWith('workflow.')
  if (request.toolName === 'workflow.advance' && request.arguments.deadline !== undefined) {
    const suppliedDeadline = request.arguments.deadline
    if (typeof suppliedDeadline !== 'number' || !Number.isFinite(suppliedDeadline) || suppliedDeadline <= 0
      || suppliedDeadline > config.operationDeadlineSeconds) {
      throw new Error('A workflow deadline exceeds the configured operation deadline.')
    }
  }
  const raw = workflow ? request.arguments.max_steps ?? config.workflowMaxSteps
    : request.arguments.deadline ?? config.operationDeadlineSeconds
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0
    || workflow && (!Number.isInteger(raw) || raw > config.workflowMaxSteps)
    || !workflow && raw > config.operationDeadlineSeconds) throw new Error('The requested Runtime budget exceeds the configured operation limit.')
  if (request.toolName === 'workflow.next' && (state.workflowDeadlineSeconds === null
    || state.workflowDeadlineSeconds > config.operationDeadlineSeconds)) {
    throw new Error('Read the current Case and verify its frozen workflow deadlines before continuation.')
  }
  const required = (workflow ? raw * config.operationDeadlineSeconds : raw) * 1000 + config.completionGraceMs
  if (request.toolCallTimeoutMs === undefined || request.toolCallTimeoutMs < required) {
    throw new Error(`MCP wait budget must be at least ${required} ms for this Runtime request.`)
  }
  if (request.toolName !== 'workflow.advance') return { ...request.arguments, [workflow ? 'max_steps' : 'deadline']: raw }
  const domainWorkflow = schema.record(schema.string(), schema.record(schema.string(), schema.json()))
    .parse(request.arguments.workflow ?? {})
  for (const section of ['debug', 'verification', 'live_patch', 'upgrade'].filter(section => domainWorkflow[section] !== undefined)) {
    const supplied = domainWorkflow[section]?.deadline ?? config.operationDeadlineSeconds
    if (typeof supplied !== 'number' || !Number.isFinite(supplied) || supplied <= 0 || supplied > config.operationDeadlineSeconds) {
      throw new Error('A workflow section exceeds the configured operation deadline.')
    }
    domainWorkflow[section] = { ...domainWorkflow[section], deadline: supplied }
  }
  return { ...request.arguments, max_steps: raw, deadline: config.operationDeadlineSeconds, workflow: domainWorkflow }
}

/** Bound the frozen domain budgets from Runtime-owned Case JSON. */
function frozenDeadline(inputs: Record<string, JsonValue>): number | null {
  const sectionSchema = schema.object({ deadline: schema.number().positive().optional() }).loose()
  const parsed = schema.object({
    deadline: schema.number().positive().optional(),
    delivery_strategy: schema.string().optional(),
    workflow: schema.record(schema.string(), sectionSchema).optional(),
  }).safeParse(inputs)
  if (!parsed.success) return null
  // The v1 Runtime protocol defaults domain deadlines to 600 seconds.
  const sections = ['debug', 'verification']
  if (parsed.data.delivery_strategy === 'build-upgrade') sections.push('upgrade')
  else if (parsed.data.delivery_strategy === 'live-patch') sections.push('live_patch')
  else if (parsed.data.delivery_strategy !== 'source-only') sections.push('upgrade', 'live_patch')
  const values = sections.map(section => parsed.data.workflow?.[section]?.deadline ?? parsed.data.deadline ?? 600)
  return Math.max(...values)
}

/**
 * Derive the Runtime's default Case identity from the trusted Session identity.
 * @param sessionId - durable Session identifier, never a model argument.
 * @returns the v1 Runtime Case identifier for this Session.
 */
export function sessionCaseId(sessionId: SessionId): OpenUbmcCaseId {
  return brandString<OpenUbmcCaseId>(`case-${createHash('sha256').update(sessionId).digest('hex').slice(0, 24)}`)
}

/** Parse the native command's operation allowlist; revoke clears all grants. */
function authorizedOperations(input: string): Set<string> {
  if (input === 'revoke') return new Set()
  const operations = input.split(',').map(value => value.trim())
  if (operations.some(operation => !targetOperations.has(operation))) {
    throw new Error('Usage: /target-authorize <comma-separated Runtime operations> | revoke')
  }
  return new Set(operations)
}

/**
 * Enforce Case ownership at MCP dispatch and record human target grants.
 * @param ctx - context carrying the MCP dispatch event and command registry.
 * @param config - exact Runtime server namespace to protect.
 */
export function apply(ctx: Context, config: Config): void {
  const stateSchema: schema.ZodType<OpenUbmcRuntimeState> = schema.object({
    inheritedEventCount: schema.number().int().nonnegative().transform(SessionLogOffset),
    caseId: schema.string().transform(value => brandString<OpenUbmcCaseId>(value)),
    operations: schema.array(schema.string()),
    pendingGrants: schema.record(schema.string().transform(CommandId), schema.string()),
    pendingCalls: schema.record(schema.string().transform(value => brandString<McpToolCall['execution']['callId']>(value)), schema.object({ operation: schema.string(), arguments: schema.record(schema.string(), schema.json()) })),
    uncertainCalls: schema.record(schema.string().transform(ToolCallId),
      schema.object({ operation: schema.string(), arguments: schema.record(schema.string(), schema.json()) })),
    reconciliableCallIds: schema.array(schema.string().transform(ToolCallId)),
    reconcileCallId: schema.string().transform(ToolCallId).nullable(),
    recoveryRequired: schema.boolean(),
    workflowDeadlineSeconds: schema.number().nonnegative().nullable(),
  })
  const callSchema = schema.object({ operation: schema.string(), arguments: schema.record(schema.string(), schema.json()) })
  const targetNames = new Map([...targetOperations].map(operation => [publicToolName(config.serverName, operation), operation]))
  ctx.sessionProjections.register({
    key: 'openubmc/runtime', stateVersion: 2, stateSchema,
    init: (header, inheritedEventCount) => ({
      inheritedEventCount, caseId: sessionCaseId(header.id), operations: [], pendingGrants: {}, pendingCalls: {},
      uncertainCalls: {}, reconciliableCallIds: [], reconcileCallId: null, recoveryRequired: false, workflowDeadlineSeconds: null,
    }),
    apply(state, event) {
      if (event.seq < state.inheritedEventCount) return state
      if (event.type === 'tool/call' && targetNames.has(event.data.name)) {
        let argumentsValue: unknown
        try { argumentsValue = JSON.parse(event.data.arguments) } catch (_error) {
          // Invalid model JSON cannot have reached the Runtime provider.
          return state
        }
        const parsed = callSchema.safeParse({ operation: targetNames.get(event.data.name), arguments: argumentsValue })
        if (!parsed.success) return state
        return { ...state, pendingCalls: { ...state.pendingCalls, [event.data.callId]: parsed.data } }
      }
      if (event.type === 'tool/result' || event.type === 'openubmc/inspection') {
        const callId = event.type === 'tool/result' ? event.data.message.toolCallId : undefined
        const pending = callId === undefined ? undefined : state.pendingCalls[callId]
        let pendingCalls = state.pendingCalls
        if (callId !== undefined) {
          const { [callId]: _settled, ...remainingCalls } = pendingCalls
          pendingCalls = remainingCalls
        }
        const parsed = resultMetadata.safeParse(event.data.meta)
        const metadata = parsed.success && parsed.data.mcp.serverName === config.serverName ? parsed.data.mcp : undefined
        const structured = metadata?.structuredContent
        const nested = schema.object({ status: schema.string() }).safeParse(structured?.agent_envelope)
        const unknown = metadata?.dispatchStatus === 'unknown'
          || (event.type === 'tool/result' ? event.data.error?.code : undefined) === TOOL_OUTCOME_UNKNOWN || (event.type === 'tool/result' ? event.data.error?.code : undefined) === TOOL_ABORTED
          || structured?.status === 'mutation_outcome_unknown' || structured?.status === 'cancelled'
          || nested.success && ['mutation_outcome_unknown', 'cancelled'].includes(nested.data.status)
        if (unknown && (pending !== undefined || metadata !== undefined && targetOperations.has(metadata.toolName))) {
          return { ...state, pendingCalls, recoveryRequired: true, operations: [], reconcileCallId: null, reconciliableCallIds: [],
            uncertainCalls: callId === undefined || pending === undefined
              ? state.uncertainCalls : { ...state.uncertainCalls, [callId]: pending },
          }
        }
        if (metadata?.toolName === 'case_read' && !event.data.message.isError) {
          const report = settledCase.safeParse(structured)
          if (report.success && report.data.case_id === state.caseId) {
            return { ...state, pendingCalls, reconcileCallId: null,
              reconciliableCallIds: report.data.operations.flatMap((operation) => {
                const id = operation.operation_id
                return operation.status === 'mutation_outcome_unknown' && id !== undefined
                  && state.uncertainCalls[id]?.operation === operation.operation
                  && ['live_patch_run', 'upgrade_run'].includes(operation.operation ?? '') ? [id] : []
              }),
              workflowDeadlineSeconds: frozenDeadline(report.data.workflow_inputs),
              recoveryRequired: state.recoveryRequired && (report.data.status === 'mutation_outcome_unknown'
                || Object.keys(report.data.mutation_outcome_unknown_operations).length > 0
                || report.data.operations.some(operation => ['accepted', 'running', 'waiting_external', 'mutation_outcome_unknown'].includes(operation.status))),
            }
          }
        }
        if (metadata?.toolName === 'workflow.advance' && metadata.dispatchStatus !== 'not-started') {
          return { ...state, pendingCalls, workflowDeadlineSeconds: null }
        }
        return pending === undefined ? state : { ...state, pendingCalls,
          reconcileCallId: metadata?.dispatchStatus === 'not-started' ? state.reconcileCallId : null,
          reconciliableCallIds: metadata?.dispatchStatus === 'not-started' ? state.reconciliableCallIds : [] }
      }
      if (event.type === 'command/run' && ['target-authorize', 'target-reconcile'].includes(event.data.name) && event.data.args !== undefined) {
        return { ...state, pendingGrants: { ...state.pendingGrants, [event.data.commandId]: event.data.name === 'target-reconcile' ? `reconcile:${event.data.args.trim()}` : event.data.args.trim() } }
      }
      if (event.type !== 'command/done') return state
      const { [event.data.commandId]: input, ...pendingGrants } = state.pendingGrants
      if (input === undefined) return state
      if (input.startsWith('reconcile:')) return { ...state, pendingGrants, reconcileCallId: event.data.kind === 'success' ? ToolCallId(input.slice(10)) : null }
      return { ...state, pendingGrants,
        reconcileCallId: event.data.kind === 'success' ? null : state.reconcileCallId,
        operations: event.data.kind === 'success' ? [...authorizedOperations(input)] : state.operations }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime'),
    name: 'target-authorize', description: 'Authorize Runtime operations for this Session',
    input: { hint: '<operation,...> | revoke' },
    handler(invocation) {
      const operations = authorizedOperations(invocation.rawInput.trim())
      const state = ctx.sessionProjections.stateOf(invocation.agent.session, 'openubmc/runtime')
      if (operations.size > 0 && (state?.recoveryRequired || Object.keys(state?.pendingCalls ?? {}).length > 0)) {
        throw new Error('Read the Case and reconcile mutation records before granting another target operation.')
      }
      return { kind: 'success', text: operations.size === 0
        ? 'Target execution authority revoked for this Session.'
        : `Target execution authorized for this Session: ${[...operations].join(', ')}.` }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime/reconcile'),
    name: 'target-reconcile', description: 'Permit one exact mutation replay after reading its journal facts', input: { hint: '<original-call-id>' },
    handler(invocation) {
      const callId = ToolCallId(invocation.rawInput.trim())
      const state = ctx.sessionProjections.stateOf(invocation.agent.session, 'openubmc/runtime')
      if (state === undefined || !state.recoveryRequired || !state.reconciliableCallIds.includes(callId)
        || Object.keys(state.pendingCalls).length > 0) throw new Error('Read the current Case before authorizing reconciliation of this original mutation call.')
      return { kind: 'success', text: `Reconciliation authorized once for ${callId}. Read the Case again after reconciliation.` }
    },
  })
  const inspections = new Map<Promise<CommandResult>, AbortController>()
  let closing = false
  ctx.effect(function* () {
    yield async () => {
      closing = true
      for (const controller of inspections.values()) controller.abort()
      await Promise.allSettled(inspections.keys())
    }
    for (const [command, operation] of [['case-refresh', 'case_read'], ['evidence', 'evidence_read']] as const) {
      yield ctx.commands.register({
        definitionId: CommandDefinitionId(`@deepseek-ai/dsh-experimental-openubmc-runtime/${command}`), name: command,
        description: command === 'evidence' ? 'Read a bounded Case evidence slice' : 'Refresh the current Case observation',
        ...(command === 'evidence' ? { input: { hint: '<evidence-id>' } } : {}),
        handler(invocation) {
          const controller = new AbortController()
          const signal = AbortSignal.any([invocation.signal, controller.signal])
          const pending = (async (): Promise<CommandResult> => {
            const evidenceId = invocation.rawInput.trim()
            if (command === 'evidence' && !/^[A-Za-z0-9_.:-]{1,256}$/.test(evidenceId)) throw new Error('Usage: /evidence <evidence-id>')
            const result = await ctx.tools.execute({ name: publicToolName(config.serverName, operation),
              callId: ToolCallId(`inspect-${invocation.commandId}`), agent: invocation.agent, signal,
              arguments: command === 'evidence' ? { evidence_id: evidenceId, limit: config.evidenceReadLimitBytes } : {},
            })
            if (closing || signal.aborted) return { kind: 'error', text: 'openUBMC inspection cancelled.' }
            const event = invocation.agent.session.append('openubmc/inspection', {
              commandId: invocation.commandId, message: { isError: result.isError },
              ...(result.meta === undefined ? {} : { meta: result.meta }),
            })
            const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
            return result.isError ? { kind: 'error', text } : { kind: 'success', text, sourceEventSeq: event.seq }
          })()
          inspections.set(pending, controller)
          const retire = (): void => { inspections.delete(pending) }
          void pending.then(retire, retire)
          return pending
        },
      })
    }
  }, 'openubmc inspection lifecycle')
  ctx.on('mcp/tool-call', async (request, next) => {
    if (request.serverName !== config.serverName) return next()
    const session = request.execution.agent?.session
    if (session === undefined) throw new Error('openUBMC execution requires a trusted Session.')
    if (request.sessionIdMetadataKey !== 'taskId') throw new Error('openUBMC MCP requires sessionIdMetadataKey: taskId.')
    const caseId = sessionCaseId(session.id)
    const supplied = request.arguments.case_id
    if (supplied !== undefined && supplied !== caseId) throw new Error('The requested Case does not belong to this Session.')
    if (request.toolName === 'runtime_status') {
      request.appliedPolicies.set('openubmc-session-authority', () => {
        if (request.arguments.case_id !== undefined && request.arguments.case_id !== caseId) throw new Error('The requested Case does not belong to this Session.')
      })
      return next()
    }
    if (!caseOperations.has(request.toolName) && !targetOperations.has(request.toolName)) {
      throw new Error(`Unsupported openUBMC Runtime operation: ${request.toolName}.`)
    }
    const authority = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
    if (authority === undefined) throw new Error('openUBMC authority projection is not registered.')
    if (targetOperations.has(request.toolName) && authority.reconcileCallId === null && !authority.operations.includes(request.toolName)) {
      throw new Error(`Target execution requires a current-session human grant for ${request.toolName}.`)
    }
    if (targetOperations.has(request.toolName)) {
      request.arguments = resolveBudget(request, config, authority)
      request.metadata['dsh/openubmc-operation-id'] = request.execution.callId
    }
    request.arguments = { ...request.arguments, case_id: caseId }
    request.appliedPolicies.set('openubmc-session-authority', () => {
      if (request.arguments.case_id !== caseId) throw new Error('The requested Case does not belong to this Session.')
      const current = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
      if (current === undefined) throw new Error('openUBMC authority projection is not registered.')
      if (targetOperations.has(request.toolName)) {
        if (Object.keys(current.pendingCalls).some(callId => callId !== request.execution.callId)) {
          throw new Error('The prior target outcome is unknown. Read the Case and mutation records before retrying.')
        }
        const reconcileCallId = current.reconcileCallId
        const original = reconcileCallId === null ? undefined : current.uncertainCalls[reconcileCallId]
        if (reconcileCallId !== null && original !== undefined) {
          const expected = resolveBudget({ ...request, toolName: original.operation, arguments: original.arguments }, config, current)
          if (request.toolName !== original.operation || !isDeepStrictEqual(request.arguments, { ...expected, case_id: caseId })) {
            throw new Error('Reconciliation requires the exact original mutation arguments.')
          }
          request.metadata['dsh/openubmc-operation-id'] = reconcileCallId
          return
        }
        if (current.recoveryRequired) {
          throw new Error('The prior target outcome is unknown. Read the Case and mutation records before retrying.')
        }
        request.arguments = resolveBudget(request, config, current)
      }
      if (targetOperations.has(request.toolName) && !current.operations.includes(request.toolName)) {
        throw new Error(`Target execution requires a current-session human grant for ${request.toolName}.`)
      }
    })
    return next()
  })
}
