/** Durable Session authority for the openUBMC Agent interface. @module */
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { OpenUbmcRunId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'

/** Original execute input and trusted operation identity for recovery. */
export interface OpenUbmcPendingCall {
  arguments: Record<string, JsonValue>
  operationId: ToolCallId
}

/** Target and operation range explicitly authorized by a human. */
export interface OpenUbmcExecutionScope {
  targets: string[]
  intent: string
  deliveryStrategy: string | null
  entryOperation: string | null
}

/** Original start scope and the retained permission for that single Run. */
export interface OpenUbmcRunScope {
  scope: OpenUbmcExecutionScope | null
  granted: boolean
}

/** Rebuildable current-session grants and Runtime-issued Run bindings. */
export interface OpenUbmcRuntimeState {
  inheritedEventCount: SessionLogOffset
  operations: string[]
  scopes: OpenUbmcExecutionScope[]
  runScopes: Record<OpenUbmcRunId, OpenUbmcRunScope>
  /** Exact starts approved through native user interaction; not general tool grants. */
  approvedCalls: Partial<Record<ToolCallId, Record<string, JsonValue>>>
  pendingGrants: Partial<Record<CommandId, string>>
  /** Only Runs returned to this Session's recorded start calls confer write access. */
  runs: Partial<Record<OpenUbmcRunId, Record<string, JsonValue>>>
  /** Calls without a recorded settlement remain uncertain after restart. */
  pendingCalls: Partial<Record<ToolCallId, OpenUbmcPendingCall>>
  uncertainCalls: Partial<Record<ToolCallId, OpenUbmcPendingCall>>
  /** Human permission for one exact replay of an unacknowledged start. */
  reconcileCallId: ToolCallId | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Human authorization for one exact start, including its bound continuation. */
    'openubmc/authorization': { callId: ToolCallId; arguments: Record<string, JsonValue> }
  }
}

/** Current-session execution controls derived from the durable authority state. */
export interface OpenUbmcRuntimeView {
  authorized: boolean
  /** Owned Runs that currently permit continuation, including read-only diagnosis. */
  executableRunIds: OpenUbmcRunId[]
  pending: number
  uncertain: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'openubmc/runtime': OpenUbmcRuntimeState
  }
  interface SessionProjectionMap {
    'openubmc/runtime': OpenUbmcRuntimeView
  }
}
