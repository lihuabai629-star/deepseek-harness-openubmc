/** Durable command-derived execution authority for openUBMC. @module */
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import type { OpenUbmcCaseId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'

/** Rebuildable grants from this Session's successful human commands. */
export interface OpenUbmcRuntimeState {
  inheritedEventCount: SessionLogOffset
  caseId: OpenUbmcCaseId
  operations: string[]
  pendingGrants: Partial<Record<CommandId, string>>
  /** Recorded target calls without a durable result; excludes inherited calls. */
  pendingCalls: Partial<Record<McpToolCall['execution']['callId'], { operation: string; arguments: Record<string, JsonValue> }>>
  /** Original current-session calls available for explicitly authorized journal reconciliation. */
  uncertainCalls: Partial<Record<ToolCallId, { operation: string; arguments: Record<string, JsonValue> }>>
  /** Unknown mutation call identities confirmed by the latest full Case read. */
  reconciliableCallIds: ToolCallId[]
  /** One exact original call approved by the native human reconciliation command. */
  reconcileCallId: ToolCallId | null
  /** Unknown outcomes require a full Case read and fresh human authority. */
  recoveryRequired: boolean
  /** Largest frozen workflow deadline from a full current-session Case read. */
  workflowDeadlineSeconds: number | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'openubmc/runtime': OpenUbmcRuntimeState
  }
}
