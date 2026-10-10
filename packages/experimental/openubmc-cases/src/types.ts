/** JSON observations derived from durable MCP tool results. @module */
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Runtime-owned Case identity, admitted from protocol JSON. */
export type OpenUbmcCaseId = Branded<'openubmc.case'>

/** Latest observed result for one Case; this carries no execution authorization. */
export interface OpenUbmcCaseObservation {
  caseId: OpenUbmcCaseId
  revision: number
  /** Case state reported by a Case projection or capsule, never an operation outcome. */
  status: string | null
  /** Outcome of the latest observed tool operation, independent of Case state. */
  operationStatus: string
  toolName: string
  isError: boolean
  /** Inherited Case information remains marked until a current-session full Case report replaces it. */
  inherited: boolean
  observedAtSeq: SessionSeq
  evidenceRefs: JsonValue[]
  /** Runtime phase records reported by a full Case projection, when present. */
  phaseRecords?: JsonValue[] | undefined
  /** Runtime artifact fingerprints reported by a full Case projection, when present. */
  artifactRevisions?: JsonValue[] | undefined
  nextActions: string[]
}

/** Read-only Case view; malformed Case metadata leaves a visible diagnostic. */
export interface OpenUbmcCasesView {
  /** Fork prefix provided with the wire view for historical observation labels. */
  inheritedEventCount?: SessionLogOffset | undefined
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

/** Read-only native inspection, independent of the model transcript. */
export interface OpenUbmcInspection {
  commandId: CommandId
  message: { isError: boolean }
  meta?: JsonValue
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Native Case/evidence query results outside the model transcript. */
    'openubmc/inspection': OpenUbmcInspection
  }
}
