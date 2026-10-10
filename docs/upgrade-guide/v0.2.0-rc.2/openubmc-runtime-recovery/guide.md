---
kind: upgrade-guide
description: "openUBMC Runtime profiles require explicit operation budgets and the trusted operation-identity launcher."
---

# openUBMC Runtime recovery

English | [中文](guide.zh.md)

## Change

Profiles loading `dsh-experimental-openubmc-runtime` require `operationDeadlineSeconds`, `completionGraceMs`, `workflowMaxSteps` and `evidenceReadLimitBytes`. Insufficient MCP wait budgets fail before dispatch. Unknown target outcomes clear grants and require Case inspection before another execution grant. Direct mutation reconciliation uses the original operation identity and exact arguments.

Native Case/evidence commands persist the required `openubmc/inspection` event. Older builds that do not recognize it reject these logs. Existing logs remain readable by this build; the Session format version does not change. Model tool arguments cannot supply trusted operation metadata.

## Migration

1. Set the Runtime plugin's four required budgets. For a 600-second domain deadline and one workflow step, use `completionGraceMs: 60000`, `workflowMaxSteps: 1`, `evidenceReadLimitBytes: 65536` and MCP `toolCallTimeoutMs: 660000`.
2. Keep MCP `sessionIdMetadataKey: taskId` and `requiredToolCallPolicies: [openubmc-session-authority]`. Launch the existing Python entry through [runtime_stdio.py](../../../../scripts/openubmc/runtime_stdio.py) with `--entry <target_runtime_mcp.py>`; [profile initialization](../../../../scripts/openubmc/README.md) produces this configuration.
3. Read `/case-refresh` after an interrupted target call. For an unknown direct mutation, use `/target-reconcile <original-call-id>` only after its journal facts appear in the Case. Workflow-derived unknown mutations remain blocked until Runtime settles them.
4. Keep a build recognizing `openubmc/inspection` when reopening logs written by native reads. Confirm a native Case query survives a process restart and an unauthorized target call fails before dispatch.
