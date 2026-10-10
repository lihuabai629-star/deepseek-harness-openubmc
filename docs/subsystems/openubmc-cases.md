# openUBMC Case observations

English | [中文](openubmc-cases.zh.md)

The experimental [openubmc-cases plugin](../../packages/experimental/openubmc-cases/README.md) publishes the read-only `openubmc/cases` Session projection. Runtime owns Case state and execution authorization; these records are observations from durable tool metadata.

Source: [`packages/experimental/openubmc-cases/src/types.ts`](../../packages/experimental/openubmc-cases/src/types.ts)

## Observation and view types

```ts type-equiv
/** Runtime-owned Case identity, admitted from protocol JSON. */
type OpenUbmcCaseId = Branded<'openubmc.case'>
```

```ts type-equiv
/** Latest observed result for one Case; this carries no execution authorization. */
interface OpenUbmcCaseObservation {
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
```

```ts type-equiv
/** Read-only Case view; malformed Case metadata leaves a visible diagnostic. */
interface OpenUbmcCasesView {
  /** Fork prefix provided with the wire view for historical observation labels. */
  inheritedEventCount?: SessionLogOffset | undefined
  cases: OpenUbmcCaseObservation[]
  failure: string | null
}
```

```ts type-equiv
/** Checkpoint-safe projection state, including the exact fork-inherited cut. */
interface OpenUbmcCasesState {
  serverName: string
  inheritedEventCount: SessionLogOffset
  view: OpenUbmcCasesView
}
```

`status` is Case state from a validated v1 context-runtime projection or capsule; it is null when no Case state has been reported. `operationStatus` is the latest agent-envelope operation outcome. A successful `case_read` can therefore leave a Case in `mutation_outcome_unknown`. Status and evidence reads preserve prior recovery information; a full Case projection supplies the authoritative observed fields. `inherited` marks Case information copied from the fork prefix until a current-session full Case report replaces it; it grants no execution rights. A malformed supported result preserves the previous observations and sets `failure`.

## Checkpoint ownership

The checkpoint contains the configured metadata source and the exact inherited prefix. It is a rebuildable fold of `tool/result` events, not a separate Case store. Historical queries do not require a live Runtime connection. The package README owns configuration and command behavior.

## Runtime authority

The [Runtime adapter](../../packages/experimental/openubmc-runtime/README.md) derives current-session human grants from native command lifecycle events.

```ts type-equiv
/** Rebuildable grants from this Session's successful human commands. */
interface OpenUbmcRuntimeState {
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
```
