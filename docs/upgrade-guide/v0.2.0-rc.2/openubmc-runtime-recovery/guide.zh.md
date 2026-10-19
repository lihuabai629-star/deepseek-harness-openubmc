---
kind: upgrade-guide
description: openUBMC profile 使用原生 observe/execute Agent 接口及 Runtime 分配的 Run 标识。
---
# openUBMC Agent 接口

[English](guide.md) | 中文

## 变更

openUBMC 适配器只接受 Runtime Agent 工具 `observe` 和 `execute`。旧工作流工具及 `/case-refresh`、`/evidence` 不再可用。`/case` 保留历史观察；`/run` 读取已记录的 Turn 与观察回执，不连接设备。Run 续接使用 `execute`，可能执行设备动作。Web profile 默认使用 DSH 原生对话；诊断卡片需显式启用。原生启动授权新增必需的 `openubmc/authorization` Session 事件。

## 迁移

1. 使用当前 openUBMC 工作流源码并设置 `OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: agent`。为此接口创建独立的 Runtime 状态目录和 DSH profile；保留旧部署以检查历史 Case。本适配器不会将旧 Case 状态转换为 Run。
2. 将 Runtime 配置中的 `workflowMaxSteps` 和 `evidenceReadLimitBytes` 替换为 `observationDeadlineSeconds: 180`。设置 `operationDeadlineSeconds: 120`、`completionGraceMs: 10000`、MCP `toolCallTimeoutMs: 190000`。保留 `sessionIdMetadataKey: taskId`、结构化结果持久化及必需策略 `openubmc-session-authority`。
3. Execute 使用规范字段名；`deliveryStrategy` 等别名会被拒绝。默认的 diagnosis-only 启动无需执行授权。其他启动通过 DSH 原生提问服务批准该次原输入，或在所属 Session 中授予 `/target-authorize execute <target> <intent> [source-only|live-patch|build-upgrade]`。`/target-authorize execute` 仍可授予广泛权限。Resume 保留已记录的权限；fork 需要新的 Run 和授权。只读例外及撤销方式参见[适配器参考](../../../../packages/experimental/openubmc-runtime/README.zh.md)。
4. 已有 Run 中断后，使用 `execute` 的 `kind: control`、`command: reconcile`。启动结果未确认时，使用 `/target-reconcile <original-call-id>` 后按原输入重放一次；宿主保留原生操作标识。取消不代表设备已回退。
5. 沿用返回的 Run 标识、Gate 绑定和 submission id。加载阶段 Skill、完成工作并通过 `respond` 提交真实证据；不变的 `no_progress` Gate 需要补充工作，而非重复 resume。持续工作使用原生 Goal 工具；活跃 Goal 重启后需要用户要求继续并重新激活。
6. 仅在需要诊断卡片时，为 profile 安装或更新添加 `--case-ui`；使用 `update --no-case-ui` 移除。修复和回滚保留各代的原选择。软件回退使用旧可执行文件的兼容 home：不认识必需 `openubmc/authorization` 或 `openubmc/inspection` 事件的构建会拒绝新 Session 日志。
7. 确认工具发现只有 `observe`、`execute`，且离线启动后 `/run` 可读取返回的 Turn。参见 [profile 配置](../../../../scripts/openubmc/README.zh.md)。
