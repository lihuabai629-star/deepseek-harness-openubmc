/** Durable command-derived execution authority for openUBMC. @module */
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { SessionLogOffset } from '@deepseek-ai/dsh-session'

/** Rebuildable grants from this Session's successful human commands. */
export interface OpenUbmcRuntimeState {
  inheritedEventCount: SessionLogOffset
  operations: string[]
  pendingGrants: Partial<Record<CommandId, string>>
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'openubmc/runtime': OpenUbmcRuntimeState
  }
}
