---
kind: upgrade-guide
description: "openUBMC Runtime profile 要求显式操作预算和可信操作标识启动器。"
---

# openUBMC Runtime 恢复

[English](guide.md) | 中文

## 变更

加载 `dsh-experimental-openubmc-runtime` 的 profile 必须配置 `operationDeadlineSeconds`、`completionGraceMs`、`workflowMaxSteps` 和 `evidenceReadLimitBytes`。MCP 等待预算不足会在发送前失败。目标结果未知会清除授权，并要求先读取 Case，再授予新的执行权限。直接变更核对使用原操作标识和完全相同的参数。

原生 Case/证据命令持久化必需事件 `openubmc/inspection`。不识别该事件的旧构建会拒绝这些日志。本构建仍可读取已有日志；Session 格式版本不变。模型工具参数不能提供可信操作元数据。

## 迁移

1. 配置 Runtime 插件的四项必需预算。领域截止时间为 600 秒、workflow 每次一步时，使用 `completionGraceMs: 60000`、`workflowMaxSteps: 1`、`evidenceReadLimitBytes: 65536`，并设置 MCP `toolCallTimeoutMs: 660000`。
2. 保留 MCP `sessionIdMetadataKey: taskId` 和 `requiredToolCallPolicies: [openubmc-session-authority]`。通过 [runtime_stdio.py](../../../../scripts/openubmc/runtime_stdio.py) 以 `--entry <target_runtime_mcp.py>` 启动已有 Python 入口；[profile 初始化](../../../../scripts/openubmc/README.zh.md) 会生成该配置。
3. 目标调用中断后执行 `/case-refresh`。直接变更结果未知时，只有其变更日志事实出现在 Case 后，才使用 `/target-reconcile <original-call-id>`。workflow 派生变更在 Runtime 确认结果之前仍保持阻止。
4. 重新打开原生读取写入的日志时，保留识别 `openubmc/inspection` 的构建。确认原生 Case 查询在进程重启后仍可恢复，并且未经授权的目标调用在发送前失败。
