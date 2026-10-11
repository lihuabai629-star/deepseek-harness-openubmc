---
description: "将 openUBMC Runtime 执行关联到 DSH Session 及其用户授权。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

[English](README.md) | 中文

## 概述

这个可选 Host 插件在 MCP 发送请求前检查 Case 归属。它使用 Runtime 按调用 Session 确定的默认 Case ID，在参数缺省时注入该 ID，并拒绝其他 ID。Case、工作流、证据和设备状态仍由 Runtime 管理。

## 目录

- [Configuration and authority](#configuration-and-authority)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration-and-authority"></a>
## 配置与授权

`serverName` 选择受保护的 MCP 命名空间。对应客户端必须设置 `sessionIdMetadataKey: taskId` 和 `requiredToolCallPolicies: [openubmc-session-authority]`；缺少 Agent 或使用其他元数据键时，请求在发送前失败。未知 Runtime 操作默认拒绝。[开发 profile](../../../scripts/openubmc/README.zh.md) 将本插件、MCP 客户端和 [Case 观察](../openubmc-cases/README.zh.md) 组合使用。[Session 集成参考](../../../docs/subsystems/openubmc-cases.zh.md) 定义导出的状态类型。

`operationDeadlineSeconds` 限制每个直接 Runtime 操作，`workflowMaxSteps` 限制一次工作流请求的自动步骤，`completionGraceMs` 为领域 deadline 之后的协议收尾保留时间。MCP 客户端的 `toolCallTimeoutMs` 必须覆盖所选 Runtime 预算和这段收尾时间；过短的等待预算会在提供方回调前拒绝。工作流 deadline 会写入 Runtime 所有的 Case 输入；工作流变更后必须重新读取 Case，才能继续 `workflow.next`。

设备和工作流操作需要用户通过原生命令授权，例如 `/target-authorize debug_run,workflow.advance,workflow.next`。成功命令替换本 Session 的允许操作；`/target-authorize revoke` 撤销全部允许操作。命令不授予 Runtime 授权例外，不选择目标，也不执行设备动作。使用前应确定 Case 目标和操作范围。Runtime 自身的授权与证据要求继续生效。

Host 的 `openubmc/runtime` 投影根据 fork 继承前缀以外、成功的 `command/run` 和 `command/done` 记录派生授权。resume 恢复授权；fork 从无授权状态开始。读取和阶段记录操作也检查 Case 归属。历史 Case 观察不会授予实时访问权限。每个 Session 对应一个确定的 Case ID，不支持接管旧 Case 或外部 Case。

MCP 执行器在提供方回调前检查所需策略的最终参数校验，因此本插件释放或重载时受保护调用会被拒绝。注册 effect 在卸载时移除命令、发送监听器和投影。不提供 invariant companion：授权只来自一个 Session 投影，没有独立维护的第二份授权存储。

目标调用被中断或连接断开时，适配器记录结果未知并清除执行授权，不推断设备已回滚。完整 `case_read` 仅在本 Session 所属 Case 的变更记录中没有活动或未确定操作时清除恢复标记；之后仍需新的用户授权才能执行目标操作。恢复期间仍可读取 Case。

## 原生读取与变更核对

`/case-refresh` 无需模型推理即可读取当前 Session 的 Case；`/evidence <evidence-id>` 最多读取 `evidenceReadLimitBytes` 字节。两个命令均验证 Case 归属，并在模型转录之外追加 `openubmc/inspection` 元数据。卸载时停止接收新命令，取消正在进行的读取并等待处理器退出。已记录的观察在重启后仍然可用。

直接调用 `live_patch_run` 或 `upgrade_run` 的结果未知时，先读取 Case。`/target-reconcile <original-call-id>` 只允许按原操作和完全相同的参数重放一次；通过 [stdio 适配器](../../../scripts/openubmc/runtime_stdio.py) 向 Python 变更日志发送原操作标识。参数变化会在发送前被拒绝。发送后的重放会消耗该许可，需要再次读取 Case。workflow 派生变更结果未知时，在 Runtime 变更日志确认结果之前仍保持阻止；适配器不会授权新的派生变更，也不会推断设备已回滚。

包含 `openubmc/inspection` 的日志要求构建版本识别该事件。旧版本会拒绝这一必需事件；Session 格式版本不变。

<a id="model-experience"></a>
## 模型体验

### Runtime 执行结果

#### 模型看到什么

Case 归属不匹配或缺少用户授权时，现有 MCP 工具返回错误，例如 `The requested Case does not belong to this Session.`。本插件不添加工具 schema 或提示词段。成功 Runtime 结果继续由 MCP 客户端呈现。

#### Token 影响

拒绝调用通过已有工具结果添加错误文本；原生命令不添加模型消息。

#### KV Cache 影响

工具结果追加到历史，不改写可复用请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **Host 范围** — 本适配器保护配置的 DSH MCP 桥接；直接访问 Python Runtime 仍需独立认证和归属策略。
- **Case 接管** — 实时操作使用 Session 派生的 Case；外部和旧 Case 保留为历史观察。
- **授权范围** — 授权选择 Session 内的操作，不允许凭据例外，也不能替代具体设备变更方案。
- **Runtime 状态** — 适配器只保存 Session 关联、待完成调用、恢复标记和 deadline 投影；Case、工作流、证据和变更记录仍以 Runtime 为准。

<a id="dev-note"></a>
### 开发备注

无。
