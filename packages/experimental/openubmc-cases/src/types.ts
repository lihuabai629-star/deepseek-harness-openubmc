/** JSON observations derived from durable MCP tool results. @module */
import type { CommandId } from '@deepseek-ai/dsh-commands'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Runtime-owned Case identity, admitted from protocol JSON. */
export type OpenUbmcCaseId = Branded<'openubmc.case'>

/** Runtime-issued semantic Run identity. */
export type OpenUbmcRunId = Branded<'openubmc.run'>

/** Opaque identity of a returned Run or observation receipt. */
export type OpenUbmcAgentResultId = Branded<'openubmc.agent-result'>

/** Complete last returned Agent result; Runtime remains the state authority. */
export interface OpenUbmcAgentObservation {
  id: OpenUbmcAgentResultId
  kind: 'run' | 'observation'
  document: Record<string, JsonValue>
  isError: boolean
  inherited: boolean
  observedAtSeq: SessionSeq
}

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
  /** Last returned Turns and receipts, including failure and recovery details. */
  agentResults?: OpenUbmcAgentObservation[] | undefined
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

/** Native Runtime query or continuation result, independent of the model transcript. */
export interface OpenUbmcInspection {
  commandId: CommandId
  message: { isError: boolean }
  meta?: JsonValue
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Native Runtime query and continuation results outside the model transcript. */
    'openubmc/inspection': OpenUbmcInspection
  }
}
