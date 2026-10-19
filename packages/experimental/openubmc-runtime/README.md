---
description: "Bind native openUBMC Agent execution and Run recovery to trusted DSH Sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

English | [中文](README.zh.md)

## Summary

An Agent can collect openUBMC evidence, complete stage work through Skills, and continue the same Runtime Run in a DSH conversation. Read-only diagnosis can start without execution approval; changes require permission for their target and operation scope. Runtime owns workflow state, Gates, Incidents, evidence and device effects.

## Table of Contents

- [Configuration and authority](#configuration-and-authority)
- [Workflow and continuation](#workflow-and-continuation)
- [Recovery and historical queries](#recovery-and-historical-queries)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration-and-authority"></a>
## Configuration and authority

`serverName` selects the protected MCP namespace. Configure that client with `sessionIdMetadataKey: taskId`, structured result persistence and `requiredToolCallPolicies: [openubmc-session-authority]`. Execute requests use canonical field names; Runtime aliases are rejected before authority checks. Calls without an Agent, unknown tools and Runtime-owned execution fields fail before dispatch. The [profile initializer](../../../scripts/openubmc/README.md) composes these settings. The [Session reference](../../../docs/subsystems/openubmc-cases.md) owns exported state types.

`operationDeadlineSeconds` bounds an execute caller wait to at most 120 seconds; `observationDeadlineSeconds` bounds observe. MCP `toolCallTimeoutMs` must cover the selected wait plus `completionGraceMs`. Runtime owns long-running continuation budgets; expiry or cancellation does not establish device rollback.

Observe and the default `execute` start with `intent: diagnosis-only`, no `entry_operation` and no `delivery_strategy` need no execution grant. A custom entry operation or delivery still requires authority when its intent says diagnosis-only.

For a valid start outside existing permissions, the Host uses DSH's native question service. Selecting `Authorize this Run` permits that exact start and its resulting Run; stage responses reuse that permission. A second start requires its own permission. The durable decision records the approved arguments and cannot authorize a changed request.

`/target-authorize execute <target> <intent> [source-only|live-patch|build-upgrade]` grants the selected target, intent and delivery scope. `/target-authorize execute` grants all Agent execution in this Session. `/target-authorize revoke` removes command and per-Run grants; read-only diagnosis remains available. These permissions bypass no Runtime evidence requirement. Resume retains recorded grants. Fork inherits historical observations, but no grants or Run write access.

`/target-action <execute action JSON>` submits `respond`, `resume` or `control` to an existing Run through the same guarded tool executor. It cannot start a Run. Results retain structured metadata and failure status in `openubmc/inspection` events without model inference. An interrupted command without a result remains pending until reconciliation. The wire view derives execution availability from this same authority projection.

Only a Turn returned to a recorded start call creates a Run binding. Continuation must use a bound Run and its original scope. Responses bind the latest returned Gate id, version and schema digest; copy the returned submission id too. Incident cancellation binds its Incident id. Runtime validates responses and owns every state transition. The adapter never injects Case ids or synthesizes Gate acceptance.

The Host hashes the trusted Session and original tool-call id into native `openubmc/operationId` metadata. The provider injects `taskId` independently of model input. The required policy rechecks authority and budgets after other middleware, immediately before dispatch. Disposal removes commands and the projection; protected dispatch then fails closed.

<a id="workflow-and-continuation"></a>
## Workflow and continuation

The model receives instructions to load the current stage's Skill, follow returned `next_action` bindings and submit actual stage results through `respond`. An evidence Gate does not itself request human approval. Incomplete work uses the statuses allowed by the returned schema; `no_progress` on an unchanged Gate calls for missing work and a response rather than repeated resume. The plugin neither performs stage work nor submits responses automatically.

Explicit requests for sustained work use DSH's existing [Goal tools](../../goal/tool-goal/README.md). A resumed active Goal requires a human continuation request and native reactivation. Opening a Session or viewing recorded results starts no device actions. DSH saves associations and request context; Runtime remains the only workflow state machine.

<a id="recovery-and-historical-queries"></a>
## Recovery and historical queries

Calls without durable settlements remain uncertain after restart. Another execution is blocked until `execute` with `kind: control` and `command: reconcile` settles the same Run. Observe and the [read-only `/run` command](../openubmc-cases/README.md) remain available; viewing a record never resumes execution.

When a start response is lost before its Run id is known, `/target-reconcile <original-call-id>` permits one exact replay with the original native operation identity. Changed inputs and concurrent replays fail before dispatch. The command refuses an original call still running in this Host, including a pending native authorization question. A failed replay retains any existing exact-start permission while the original outcome remains unresolved. Existing Runs use Runtime reconciliation instead of replaying device effects.

Use an independent home and Agent Runtime state directory when upgrading. Builds without the required `openubmc/authorization` or `openubmc/inspection` events refuse newer Session logs; software rollback uses the older build's compatible home. Historical Case logs remain readable; the adapter does not translate old Case writers into Runs. See the [upgrade guide](../../../docs/upgrade-guide/v0.2.0-rc.2/openubmc-runtime-recovery/guide.md).

<a id="model-experience"></a>
## Model Experience

### Workflow guidance and execution results

#### What the model sees

The system prompt includes: `A response_required Gate requests actual work and evidence; it does not by itself require human approval.` Guidance covers Skill loading, truthful submissions, native authorization, Goal continuation and unknown outcomes. A fixed-field runtime-context snapshot reports recorded permission and Run/call/Gate/Incident counts without copying evidence or Gate schemas. The existing MCP tools return binding errors such as `The requested Run does not belong to this Session.` and retain complete structured results, including failed Turns. The plugin adds no tools.

#### Token effect

Static guidance contributes to the system prompt. Changes in recorded permission or counts append a runtime-context snapshot; earlier snapshots remain logged. Tool results retain their existing text and structured JSON, so guidance does not duplicate their evidence payloads.

#### KV Cache effect

Unchanged static guidance remains reusable in the request prefix. Dynamic context and tool results append to history; changing the static instructions changes the system prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Access policy** — the adapter protects this DSH bridge; direct Runtime access needs its own access policy. External Runs cannot be adopted by supplying a model-generated id.
- **Observation freshness** — observations describe the last returned result and may be stale. DSH holds associations and projections, never a second workflow or device journal.
- **Stage work** — guidance does not establish that a source change, check or diagnosis is valid. The Agent must perform the work and supply actual evidence to Runtime.

<a id="dev-note"></a>
### Dev Note

No invariant companion is published: authority is one rebuildable Session projection, without an independently maintained store.
