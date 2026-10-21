---
kind: upgrade-guide
description: openUBMC profiles use the native observe/execute Agent interface and Runtime-issued Run identities.
---
# openUBMC Agent interface

English | [中文](guide.zh.md)

## Change

The openUBMC adapter accepts only the Runtime Agent tools `observe` and `execute`. Legacy workflow tools and `/case-refresh` and `/evidence` are unavailable. `/case` retains recorded historical observations; `/run` reads recorded Turns and observation receipts without contacting a device. Run continuation uses `execute` and can perform device actions. Web profiles default to DSH's native conversation; diagnostic cards require an explicit option. Native start approvals add a required `openubmc/authorization` Session event.

## Migration

1. Use the current openUBMC workflow source with `OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: agent`. Create a separate Runtime state directory and DSH profile for this interface; retain the old deployment for historical Case inspection. This adapter does not convert legacy Case state into Runs.
2. Replace the Runtime config's `workflowMaxSteps` and `evidenceReadLimitBytes` with `observationDeadlineSeconds: 180`. Set `operationDeadlineSeconds: 120`, `completionGraceMs: 10000` and MCP `toolCallTimeoutMs: 190000`. Keep `sessionIdMetadataKey: taskId`, structured result persistence and the required `openubmc-session-authority` policy.
3. Use canonical execute field names; aliases such as `deliveryStrategy` are rejected. Default diagnosis-only starts need no execution grant. For other starts, approve the exact request through DSH's native question service, or grant `/target-authorize execute <target> <intent> [source-only|live-patch|build-upgrade]` in the owning Session. `/target-authorize execute` remains a broad grant. Resume retains recorded permissions; forks need new Runs and authority. See the [adapter reference](../../../../packages/experimental/openubmc-runtime/README.md) for the read-only exception and revocation.
4. For an interrupted existing Run use `execute` with `kind: control` and `command: reconcile`. For an unacknowledged start use `/target-reconcile <original-call-id>` and replay the exact original input once; the Host preserves its native operation identity. Never infer a rollback from cancellation.
5. Follow the returned Run id, Gate bindings and submission id. Load the stage's Skill, perform the work and submit actual evidence through `respond`; an unchanged `no_progress` Gate needs work rather than repeated resume. Sustained work uses native Goal tools; a restarted active Goal needs human continuation and reactivation.
6. Add `--case-ui` to profile install or update only when diagnostic cards are wanted; use `update --no-case-ui` to remove them. Repair and rollback retain each generation's original choice. For software rollback, use the old executable's compatible home: builds without required `openubmc/authorization` or `openubmc/inspection` events refuse newer Session logs.
7. Confirm tools discovery exposes only `observe` and `execute`, and `/run` reports the resulting Turn after an offline start. See the [profile setup](../../../../scripts/openubmc/README.md).
