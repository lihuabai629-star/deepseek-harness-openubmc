---
description: "Bind native openUBMC Agent execution and Run recovery to trusted DSH Sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

English | [中文](README.zh.md)

## Summary

This optional Host plugin protects the Runtime Agent tools `observe` and `execute`. It binds Runtime-issued Runs to their starting Session and retains caller identity across restart. Runtime owns workflow state, Gates, Incidents, evidence and device effects.

## Table of Contents

- [Configuration and authority](#configuration-and-authority)
- [Recovery and historical queries](#recovery-and-historical-queries)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration and authority

`serverName` selects the protected MCP namespace. Configure that client with `sessionIdMetadataKey: taskId`, structured result persistence and `requiredToolCallPolicies: [openubmc-session-authority]`. Calls without an Agent, unknown tools and Runtime-owned execution fields fail before dispatch. The [profile initializer](../../../scripts/openubmc/README.md) composes these settings. The [Session reference](../../../docs/subsystems/openubmc-cases.md) owns exported state types.

`operationDeadlineSeconds` bounds an execute caller wait to at most 120 seconds; `observationDeadlineSeconds` bounds observe. MCP `toolCallTimeoutMs` must cover the selected wait plus `completionGraceMs`. Runtime owns long-running continuation budgets; expiry or cancellation does not establish device rollback.

`/target-authorize execute` enables execution in the current Session; `/target-authorize revoke` removes it. Observe needs no execution grant. The command selects no target and bypasses no Runtime authorization or evidence requirement. Resume restores successful command grants. A fork inherits historical observations but neither grants nor Run write access.

Only a Turn returned to a recorded start call creates a Run binding. Continuation must use a bound Run. Responses bind the latest returned Gate id, version and schema digest; incident cancellation binds its Incident id. Runtime validates response contents and owns every state transition. The adapter never injects Case ids or synthesizes Gate acceptance.

The Host hashes the trusted Session and original tool-call id into native `openubmc/operationId` metadata. The provider injects `taskId` independently of model input. The required policy rechecks authority and budgets after other middleware, immediately before dispatch. Disposal removes commands and the projection; protected dispatch then fails closed.

## Recovery and historical queries

Calls without durable settlements remain uncertain after restart. Another execution is blocked until `execute` with `kind: control` and `command: reconcile` settles the same Run. Observe and the [read-only `/run` command](../openubmc-cases/README.md) remain available; viewing a record never resumes execution.

When a start response is lost before its Run id is known, `/target-reconcile <original-call-id>` permits one exact replay with the original native operation identity. Changed inputs and concurrent replays fail before dispatch. The command refuses an original call still running in this Host. Existing Runs use Runtime reconciliation instead of replaying device effects.

Use an independent Agent Runtime state directory when upgrading a legacy deployment. Historical Case logs remain readable; the adapter does not translate old Case writers into Runs. See the [upgrade guide](../../../docs/upgrade-guide/v0.2.0-rc.2/openubmc-runtime-recovery/guide.md).

## Dev Note

No invariant companion is published: authority is one rebuildable Session projection, without an independently maintained store.

## Model Experience

### Runtime execution results

#### What the model sees

The existing MCP tools return authority and binding errors, including `The requested Run does not belong to this Session.` The plugin adds no tools or prompt sections. The MCP bridge logs Runtime summaries and complete structured results, including failed Turns.

#### Token effect

A denied call contributes its error text through the existing tool result; native commands add no model messages.

#### KV Cache effect

Tool results append to history without rewriting the reusable request prefix.

## Known Limitations and Deferred Work

- **Access policy** — the adapter protects this DSH bridge; direct Runtime access needs its own access policy. External Runs cannot be adopted by supplying a model-generated id.
- **Observation freshness** — observations describe the last returned result and may be stale. DSH holds associations and projections, never a second workflow or device journal.
