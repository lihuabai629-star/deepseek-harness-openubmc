---
description: "将原生 openUBMC Agent 执行与 Run 恢复绑定到可信 DSH Session。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

[English](README.md) | 中文

## 概述

此可选 Host 插件保护 Runtime Agent 工具 `observe` 和 `execute`。它将 Runtime 返回的 Run 绑定到启动它的 Session，并在重启后保留调用身份。工作流状态、Gate、Incident、证据和设备动作由 Runtime 管理。

## 目录

- [配置与授权](#configuration-and-authority)
- [恢复与历史查询](#recovery-and-historical-queries)
- [开发备注](#dev-note)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="configuration-and-authority"></a>
## 配置与授权

`serverName` 选择受保护的 MCP 命名空间。对应客户端需配置 `sessionIdMetadataKey: taskId`、结构化结果持久化及 `requiredToolCallPolicies: [openubmc-session-authority]`。缺少 Agent、未知工具及 Runtime 自有执行字段在发送前被拒绝。[profile 初始化器](../../../scripts/openubmc/README.zh.md) 组合这些配置；[Session 参考](../../../docs/subsystems/openubmc-cases.zh.md) 定义导出的状态类型。

`operationDeadlineSeconds` 将 execute 的调用方等待限制在 120 秒以内；`observationDeadlineSeconds` 限制 observe。MCP 的 `toolCallTimeoutMs` 必须覆盖所选等待及 `completionGraceMs`。长动作的续接预算由 Runtime 管理；超时或取消不代表设备已回退。

`/target-authorize execute` 开启当前 Session 的执行权限；`/target-authorize revoke` 撤销权限。Observe 不需要执行授权。该命令不选择目标，也不跳过 Runtime 的授权和证据要求。Resume 恢复成功命令授予的权限；fork 继承历史观察，但不继承授权或 Run 写权限。

只有已记录的 start 调用返回 Turn 后，才建立 Run 绑定。续接必须使用已绑定的 Run。响应需绑定最新返回的 Gate 标识、版本和 schema 摘要；Incident 取消需绑定其标识。Runtime 验证响应内容并管理全部状态转换。适配器不注入 Case 标识，也不代为接受 Gate。

宿主将可信 Session 与原工具调用标识哈希为原生 `openubmc/operationId` 元数据。提供方独立于模型输入注入 `taskId`。必需策略在其他中间件之后、实际发送之前再次校验权限和预算。卸载移除命令和投影，后续受保护调用会被拒绝。

<a id="recovery-and-historical-queries"></a>
## 恢复与历史查询

缺少持久化结果的调用在重启后仍属于未知状态。在 `execute` 的 `kind: control`、`command: reconcile` 核对同一 Run 前，其他执行保持阻止。Observe 与[只读 `/run` 命令](../openubmc-cases/README.zh.md) 仍可用；查看记录不会推进执行。

启动回包丢失、尚未得到 Run 标识时，`/target-reconcile <original-call-id>` 允许按原输入和原生操作标识重放一次。输入变化和并发重放在发送前失败。原调用仍在当前宿主运行时，该命令会被拒绝。已有 Run 使用 Runtime 的核对操作，不重放设备动作。

升级旧部署时使用独立的 Agent Runtime 状态目录。历史 Case 日志仍可读取；适配器不将旧 Case 写接口转换为 Run。参见[升级指南](../../../docs/upgrade-guide/v0.2.0-rc.2/openubmc-runtime-recovery/guide.zh.md)。

<a id="dev-note"></a>
## 开发备注

不发布 invariant 配套模块：授权来自可重建的 Session 投影，没有独立维护的状态库。

## Model Experience

### Runtime 执行结果

#### 模型所见

现有 MCP 工具返回授权和绑定错误，包括 `The requested Run does not belong to this Session.`。插件不增加工具或提示词段落。MCP 桥记录 Runtime 摘要和完整结构化结果，包括失败的 Turn。

#### Token 影响

被拒绝调用通过现有工具结果贡献错误文本；原生命令不增加模型消息。

#### KV Cache 影响

工具结果追加到历史，不改写可复用的请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **访问策略** — 适配器保护当前 DSH 桥，直接访问 Runtime 需要独立的访问策略。不能通过模型生成的标识接管外部 Run。
- **观察时效** — 观察反映最近返回的结果，可能已经过期。DSH 只保存关联和投影，不维护第二套工作流或设备变更日志。
