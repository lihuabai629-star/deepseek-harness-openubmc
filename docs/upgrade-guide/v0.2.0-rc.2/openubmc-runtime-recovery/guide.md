---
kind: upgrade-guide
description: openUBMC profiles use the native observe/execute Agent interface and Runtime-issued Run identities.
---
# openUBMC Agent interface

English | [中文](guide.zh.md)

## Change

The openUBMC adapter accepts only the Runtime Agent tools `observe` and `execute`. Legacy workflow tools and `/case-refresh` and `/evidence` are unavailable. `/case` retains recorded historical observations; `/run` reads recorded Turns and observation receipts without contacting a device. Run continuation uses `execute` and can perform device actions.

## Migration

1. Use the current openUBMC workflow source with `OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: agent`. Create a separate Runtime state directory and DSH profile for this interface; retain the old deployment for historical Case inspection. This adapter does not convert legacy Case state into Runs.
2. Replace the Runtime config's `workflowMaxSteps` and `evidenceReadLimitBytes` with `observationDeadlineSeconds: 180`. Set `operationDeadlineSeconds: 120`, `completionGraceMs: 10000` and MCP `toolCallTimeoutMs: 190000`. Keep `sessionIdMetadataKey: taskId`, structured result persistence and the required `openubmc-session-authority` policy.
3. Use `/target-authorize execute` in the owning Session. Start Runs through `execute` and use their returned ids for continuation. Gate responses must match the latest returned Gate id, version and schema digest. Forks retain observations but need new Runs and fresh authority.
4. For an interrupted existing Run use `execute` with `kind: control` and `command: reconcile`. For an unacknowledged start use `/target-reconcile <original-call-id>` and replay the exact original input once; the Host preserves its native operation identity. Never infer a rollback from cancellation.
5. Confirm tools discovery exposes only `observe` and `execute`, and `/run` reports the resulting Turn after an offline start. See the [profile setup](../../../../scripts/openubmc/README.md).
