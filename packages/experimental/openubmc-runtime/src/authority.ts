/** Target-scoped permissions for native Runtime starts and their continuations. @module */
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { OpenUbmcExecutionScope, OpenUbmcRuntimeState } from './types.ts'

const target = z.string().min(1).max(512)
const start = z.object({
  kind: z.literal('start'), target: target.optional(),
  targets: z.array(z.object({ ip: target })).min(2).max(16).optional(),
  intent: z.string().min(1), delivery_strategy: z.string().optional(), entry_operation: z.string().optional(),
})

/**
 * Resolve the targets and operation range of a protocol start.
 * @param args - Untrusted model or persisted start arguments.
 * @returns The resolved scope, or null when the start lacks required fields.
 */
export function startScope(args: Record<string, unknown>): OpenUbmcExecutionScope | null {
  const result = start.safeParse(args)
  if (!result.success) return null
  const value = result.data
  const targets = value.targets?.map(item => item.ip) ?? (value.target === undefined ? [] : [value.target])
  if (targets.length === 0 || value.targets !== undefined && value.target !== undefined && value.target !== targets[0]) return null
  return { targets, intent: value.intent, deliveryStrategy: value.delivery_strategy ?? null, entryOperation: value.entry_operation ?? null }
}

/**
 * Identify the protocol's default diagnostic workflow without a custom operation.
 * @param scope - Scope resolved from the original start.
 * @returns Whether its workflow is limited to read-only diagnosis.
 */
export function readOnlyScope(scope: OpenUbmcExecutionScope | null): boolean {
  return scope?.intent === 'diagnosis-only' && scope.deliveryStrategy === null && scope.entryOperation === null
}

/**
 * Read an explicit native command permission without interpreting model text.
 * @param input - Human command arguments.
 * @returns A full execute grant, a scoped grant, or revocation.
 */
export function commandGrant(input: string): 'execute' | 'revoke' | OpenUbmcExecutionScope {
  if (input === 'execute' || input === 'revoke') return input
  const parts = input.split(/\s+/)
  if (parts.length < 3 || parts.length > 4 || parts[0] !== 'execute') {
    throw new Error('Usage: /target-authorize execute [target intent [source-only|live-patch|build-upgrade]] | revoke')
  }
  const [, selectedTarget, intent, deliveryStrategy] = parts
  if (deliveryStrategy !== undefined && !['source-only', 'live-patch', 'build-upgrade'].includes(deliveryStrategy)) {
    throw new Error('Unsupported delivery strategy in target authorization.')
  }
  return { targets: [target.parse(selectedTarget)], intent: z.string().min(1).parse(intent),
    deliveryStrategy: deliveryStrategy ?? null, entryOperation: null }
}

/**
 * Check retained permission for the exact start or the original scope of an owned Run.
 * @param request - Provider dispatch with trusted call identity.
 * @param state - Durable authority projection.
 * @returns Whether dispatch has current execution permission.
 */
export function executionAllowed(request: McpToolCall, state: OpenUbmcRuntimeState): boolean {
  if (state.operations.includes('execute')) return true
  const args = request.arguments
  if (args.kind === 'start') {
    const scope = startScope(args)
    const approved = state.approvedCalls[request.execution.callId]
    return readOnlyScope(scope) || approved !== undefined && isDeepStrictEqual(approved, args)
      || scope !== null && state.scopes.some(grant => isDeepStrictEqual(grant, scope))
  }
  const run = typeof args.run_id === 'string' ? Object.entries(state.runScopes).find(([id]) => id === args.run_id)?.[1] : undefined
  return run !== undefined && (readOnlyScope(run.scope) || run.granted
    || run.scope !== null && state.scopes.some(grant => isDeepStrictEqual(grant, run.scope)))
}

/**
 * Ask the native human interaction service to authorize one exact proposed Run.
 * @param ctx - Host context with an optional native question service.
 * @param request - Validated start and its live calling Agent.
 * @returns After a durable grant, or rejects without permitting dispatch.
 */
export async function requestRunAuthorization(ctx: Context, request: McpToolCall): Promise<void> {
  const scope = startScope(request.arguments)
  const agent = request.execution.agent
  const questions = ctx.get('userQuestions')
  if (scope === null || request.arguments.kind !== 'start' || agent === undefined || questions === undefined) {
    throw new Error('Target execution requires human authorization for this scope. Use /target-authorize execute target intent [delivery-strategy].')
  }
  const approvedArguments = z.record(z.string(), z.json()).parse(request.arguments)
  const approve = 'Authorize this Run'
  const purpose = typeof request.arguments.purpose === 'string' ? request.arguments.purpose : scope.intent
  const answer = await questions.ask({ agent, signal: request.execution.signal, wait: { callId: request.execution.callId }, questions: [{
    id: 'openubmc-execution', question: `Allow this task on ${scope.targets.join(', ')}?`,
    detail: `${purpose}\nOperation: ${scope.intent}\nDelivery: ${scope.deliveryStrategy ?? 'Runtime default'}\nEntry: ${scope.entryOperation ?? 'Runtime default'}\nPermission covers this Run and its stage continuations.`,
    options: [{ label: approve, description: 'Allow this task and its required stage handoffs.' },
      { label: 'Decline', description: 'Leave the proposed task unstarted.' }],
  }] })
  const decision = answer.answers.find(item => item.id === 'openubmc-execution')
  if (decision?.selected.length !== 1 || decision.selected[0] !== approve || decision.custom !== undefined) {
    throw new Error('Target execution was not authorized.')
  }
  if (!isDeepStrictEqual(request.arguments, approvedArguments)) throw new Error('The proposed start changed while authorization was pending.')
  agent.session.append('openubmc/authorization', { callId: request.execution.callId, arguments: approvedArguments })
}
