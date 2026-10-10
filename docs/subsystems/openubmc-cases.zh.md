# openUBMC Case 观察

[English](openubmc-cases.md) | 中文

实验性 [openubmc-cases 插件](../../packages/experimental/openubmc-cases/README.zh.md)发布只读 `openubmc/cases` Session（会话）投影。Runtime 拥有 Case（案例）状态及执行授权；这些记录是从持久化工具元数据获得的观察。

源码：[`packages/experimental/openubmc-cases/src/types.ts`](../../packages/experimental/openubmc-cases/src/types.ts)

## 观察及视图类型

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

`status` 是来自经过验证的 v1 context-runtime 投影或 capsule（状态摘要）的 Case 状态；未报告 Case 状态时为 null。`operationStatus` 是最近一次 agent-envelope 操作的结果。因此，成功的 `case_read` 仍可能让 Case 保持 `mutation_outcome_unknown`。状态和证据读取保留已有恢复信息；完整 Case 投影提供权威的已观察字段。`inherited` 标记从 fork（分叉）继承前缀复制的 Case 信息，直到当前会话的完整 Case 报告替换它；此标志不授予执行权限。支持的结果格式有误时，保留已有观察并设置 `failure`。

## 检查点归属

检查点包含配置的元数据来源及确切继承前缀。它是可重建的 `tool/result` 事件归并结果，不是独立的 Case 存储。历史查询不需要在线 Runtime 连接。配置及命令行为由包 README 说明。

## Runtime authority

[Runtime 适配器](../../packages/experimental/openubmc-runtime/README.zh.md) 根据原生命令生命周期事件派生当前 Session 的用户授权。

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
