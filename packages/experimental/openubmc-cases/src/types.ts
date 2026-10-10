/** JSON observations derived from durable MCP tool results. @module */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Runtime-owned Case identity, admitted from protocol JSON. */
export type OpenUbmcCaseId = Branded<'openubmc.case'>

/** Latest observed result for one Case; this carries no execution authorization. */
export interface OpenUbmcCaseObservation {
  caseId: OpenUbmcCaseId
  revision: number | null
  status: string
  toolName: string
  isError: boolean
  inherited: boolean
  observedAtSeq: SessionSeq
  evidenceRefs: JsonValue[]
  nextActions: string[]
}

/** Read-only Case view; malformed Case metadata leaves a visible diagnostic. */
export interface OpenUbmcCasesView {
  cases: OpenUbmcCaseObservation[]
  failure: string | null
}

/** Checkpoint-safe projection state, including the exact fork-inherited cut. */
export interface OpenUbmcCasesState {
  serverName: string
  inheritedEventCount: SessionLogOffset
  view: OpenUbmcCasesView
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'openubmc/cases': OpenUbmcCasesState
  }
  interface SessionProjectionMap {
    'openubmc/cases': OpenUbmcCasesView
  }
}
