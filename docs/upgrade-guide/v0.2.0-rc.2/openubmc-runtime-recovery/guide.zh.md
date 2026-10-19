---
kind: upgrade-guide
description: openUBMC profile 使用原生 observe/execute Agent 接口及 Runtime 分配的 Run 标识。
---
# openUBMC Agent 接口

[English](guide.md) | 中文

## 变更

openUBMC 适配器只接受 Runtime Agent 工具 `observe` 和 `execute`。旧工作流工具及 `/case-refresh`、`/evidence` 不再可用。`/case` 保留历史观察；`/run` 读取已记录的 Turn 与观察回执，不连接设备。Run 续接使用 `execute`，可能执行设备动作。

## 迁移

1. 使用当前 openUBMC 工作流源码并设置 `OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: agent`。为此接口创建独立的 Runtime 状态目录和 DSH profile；保留旧部署以检查历史 Case。本适配器不会将旧 Case 状态转换为 Run。
2. 将 Runtime 配置中的 `workflowMaxSteps` 和 `evidenceReadLimitBytes` 替换为 `observationDeadlineSeconds: 180`。设置 `operationDeadlineSeconds: 120`、`completionGraceMs: 10000`、MCP `toolCallTimeoutMs: 190000`。保留 `sessionIdMetadataKey: taskId`、结构化结果持久化及必需策略 `openubmc-session-authority`。
3. 在所属 Session 中使用 `/target-authorize execute`。通过 `execute` 启动 Run，后续沿用返回的标识。Gate 响应必须绑定最新返回的 Gate 标识、版本及 schema 摘要。Fork 保留观察，但需要新的 Run 和授权。
4. 已有 Run 中断后，使用 `execute` 的 `kind: control`、`command: reconcile`。启动结果未确认时，使用 `/target-reconcile <original-call-id>` 后按原输入重放一次；宿主保留原生操作标识。取消不代表设备已回退。
5. 确认工具发现只有 `observe`、`execute`，且离线启动后 `/run` 可读取返回的 Turn。参见 [profile 配置](../../../../scripts/openubmc/README.zh.md)。
