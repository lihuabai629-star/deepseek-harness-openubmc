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

/** Rebuildable current-session grants and Runtime-issued Run bindings. */
export interface OpenUbmcRuntimeState {
  inheritedEventCount: SessionLogOffset
  operations: string[]
  pendingGrants: Partial<Record<CommandId, string>>
  /** Only Runs returned to this Session's recorded start calls confer write access. */
  runs: Partial<Record<OpenUbmcRunId, Record<string, JsonValue>>>
  /** Calls without a recorded settlement remain uncertain after restart. */
  pendingCalls: Partial<Record<ToolCallId, OpenUbmcPendingCall>>
  uncertainCalls: Partial<Record<ToolCallId, OpenUbmcPendingCall>>
  /** Human permission for one exact replay of an unacknowledged start. */
  reconcileCallId: ToolCallId | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'openubmc/runtime': OpenUbmcRuntimeState
  }
}
