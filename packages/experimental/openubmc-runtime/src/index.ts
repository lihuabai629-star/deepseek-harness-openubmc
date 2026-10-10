/** Session-owned openUBMC execution over the existing MCP bridge. @module */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { CommandDefinitionId, CommandId } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset, type SessionId } from '@deepseek-ai/dsh-session'
import type { OpenUbmcCaseId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import type {} from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { OpenUbmcRuntimeState } from './types.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'openubmc-runtime'
/** Human command registry used to record explicit target authority. */
export const inject = ['commands', 'sessionProjections']

/** Exact Runtime namespace protected by this adapter. */
export interface Config {
  /** MCP server configured with trusted Session metadata. */
  serverName: string
}
/** Required source selection; unknown Runtime tools fail closed. */
export const Config: z<Config> = z.object({ serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/) })

const targetOperations = new Set(['debug_run', 'debug_collect', 'live_patch_run', 'upgrade_run', 'workflow.advance', 'workflow.next'])
const caseOperations = new Set(['case_read', 'evidence_read', 'case_close', 'case_forget', 'phase_record'])

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
    operations: schema.array(schema.string()),
    pendingGrants: schema.record(schema.string().transform(CommandId), schema.string()),
  })
  ctx.sessionProjections.register({
    key: 'openubmc/runtime', stateVersion: 1, stateSchema,
    init: (_header, inheritedEventCount) => ({ inheritedEventCount, operations: [], pendingGrants: {} }),
    apply(state, event) {
      if (event.seq < state.inheritedEventCount) return state
      if (event.type === 'command/run' && event.data.name === 'target-authorize' && event.data.source.kind === 'user' && event.data.args !== undefined) {
        return { ...state, pendingGrants: { ...state.pendingGrants, [event.data.commandId]: event.data.args.trim() } }
      }
      if (event.type !== 'command/done') return state
      const { [event.data.commandId]: input, ...pendingGrants } = state.pendingGrants
      if (input === undefined) return state
      return { ...state, pendingGrants, operations: event.data.kind === 'success' ? [...authorizedOperations(input)] : state.operations }
    },
  })
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-runtime'),
    name: 'target-authorize', description: 'Authorize Runtime operations for this Session',
    input: { hint: '<operation,...> | revoke' },
    handler(invocation) {
      const operations = authorizedOperations(invocation.rawInput.trim())
      return { kind: 'success', text: operations.size === 0
        ? 'Target execution authority revoked for this Session.'
        : `Target execution authorized for this Session: ${[...operations].join(', ')}.` }
    },
  })
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
    if (targetOperations.has(request.toolName) && !authority.operations.includes(request.toolName)) {
      throw new Error(`Target execution requires a current-session human grant for ${request.toolName}.`)
    }
    request.arguments = { ...request.arguments, case_id: caseId }
    request.appliedPolicies.set('openubmc-session-authority', () => {
      if (request.arguments.case_id !== caseId) throw new Error('The requested Case does not belong to this Session.')
      const current = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
      if (current === undefined) throw new Error('openUBMC authority projection is not registered.')
      if (targetOperations.has(request.toolName) && !current.operations.includes(request.toolName)) {
        throw new Error(`Target execution requires a current-session human grant for ${request.toolName}.`)
      }
    })
    return next()
  })
}
