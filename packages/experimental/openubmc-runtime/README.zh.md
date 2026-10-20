---
description: "将原生 openUBMC Agent 执行与 Run 恢复绑定到可信 DSH Session。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

[English](README.md) | 中文

## 概述

Agent 可以在 DSH 对话中收集 openUBMC 证据、通过 Skill 完成阶段工作，并续接同一个 Runtime Run。只读诊断无需执行审批即可开始；变更需要相应目标和操作范围的权限。工作流状态、Gate、Incident、证据和设备动作由 Runtime 管理。

## 目录

- [配置与授权](#configuration-and-authority)
- [工作流与续接](#workflow-and-continuation)
- [恢复与历史查询](#recovery-and-historical-queries)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration-and-authority"></a>
## 配置与授权

`serverName` 选择受保护的 MCP 命名空间。对应客户端需配置 `sessionIdMetadataKey: taskId`、结构化结果持久化及 `requiredToolCallPolicies: [openubmc-session-authority]`。Execute 请求使用规范字段名；Runtime 别名会在授权检查前被拒绝。缺少 Agent、未知工具及 Runtime 自有执行字段在发送前被拒绝。[profile 初始化器](../../../scripts/openubmc/README.zh.md) 组合这些配置。可安装 bundle 通过 `createRuntimeController` 复用纯授权归约、请求检查和指引，并使用插件自有的桥与持久授权写入器；其[安装说明](../../../scripts/openubmc/distribution/README.zh.md)定义可移植持久化语义。[Session 参考](../../../docs/subsystems/openubmc-cases.zh.md) 定义导出的状态类型。

`operationDeadlineSeconds` 将 execute 的调用方等待限制在 120 秒以内；`observationDeadlineSeconds` 限制 observe。MCP 的 `toolCallTimeoutMs` 必须覆盖所选等待及 `completionGraceMs`。长动作的续接预算由 Runtime 管理；超时或取消不代表设备已回退。

Observe 和默认 `execute` 启动无需执行授权；默认启动使用 `intent: diagnosis-only`，不带 `entry_operation` 或 `delivery_strategy`。自定义入口操作或交付方式即使标明 diagnosis-only，也仍需授权。

有效的 start 超出现有权限时，宿主通过 DSH 原生问答服务请求授权。选择 `Authorize this Run` 只授权该次 start 及其返回的 Run；阶段响应复用该权限。另一次 start 需要另行授权。持久化决定记录批准的原始参数，不能授权变更后的请求。

`/target-authorize execute <target> <intent> [source-only|live-patch|build-upgrade]` 授予选定目标、意图和交付范围的权限。`/target-authorize execute` 授予当前 Session 全部 Agent 执行权限。`/target-authorize revoke` 撤销命令和单个 Run 的授权；只读诊断仍可使用。这些权限不跳过 Runtime 的证据要求。Resume 保留已记录的授权；fork 继承历史观察，但不继承授权或 Run 写权限。

`/target-action <execute action JSON>` 通过相同的受保护工具执行器向已有 Run 提交 `respond`、`resume` 或 `control`，不能启动新 Run。结果在 `openubmc/inspection` 事件中保留结构化元数据和失败状态，不触发模型推理。命令中断且没有结果时，在核对前保持待结算状态。传输视图从同一授权投影派生执行可用性。

只有已记录的 start 调用返回 Turn 后，才建立 Run 绑定。续接必须使用已绑定的 Run 及其原始范围。响应需绑定最新返回的 Gate 标识、版本和 schema 摘要，同时复制返回的提交标识。Incident 取消需绑定其标识。Runtime 验证响应并管理全部状态转换。适配器不注入 Case 标识，也不代为接受 Gate。

宿主将可信 Session 与原工具调用标识哈希为原生 `openubmc/operationId` 元数据。提供方独立于模型输入注入 `taskId`。必需策略在其他中间件之后、实际发送之前再次校验权限和预算。卸载移除命令和投影，后续受保护调用会被拒绝。

<a id="workflow-and-continuation"></a>
## 工作流与续接

模型收到的指引要求加载当前阶段的 Skill、沿用返回的 `next_action` 绑定，并通过 `respond` 提交真实阶段结果。证据 Gate 本身不要求用户审批。未完成的工作使用返回 schema 允许的状态；同一 Gate 返回 `no_progress` 时，需要补齐工作并响应，而不是重复 resume。插件不会自动执行阶段工作或提交响应。

用户明确要求持续工作时，使用 DSH 现有的 [Goal 工具](../../goal/tool-goal/README.zh.md)。恢复后的活动 Goal 需要用户提出继续请求，再通过原生操作重新启用。打开 Session 或查看已记录结果不会启动设备动作。DSH 保存关联和请求上下文；Runtime 是唯一的工作流状态机。

<a id="recovery-and-historical-queries"></a>
## 恢复与历史查询

缺少持久化结果的调用在重启后仍属于未知状态。在 `execute` 的 `kind: control`、`command: reconcile` 核对同一 Run 前，其他执行保持阻止。Observe 与[只读 `/run` 命令](../openubmc-cases/README.zh.md) 仍可用；查看记录不会推进执行。

启动回包丢失、尚未得到 Run 标识时，`/target-reconcile <original-call-id>` 允许按原输入和原生操作标识重放一次。输入变化和并发重放在发送前失败。原调用仍在当前宿主运行时，该命令会被拒绝，包括仍待回答的原生授权问题。重放失败且原结果仍未确认时，保留已有的单次原输入启动权限。已有 Run 使用 Runtime 的核对操作，不重放设备动作。

升级时使用独立 home 和 Agent Runtime 状态目录。不认识必需 `openubmc/authorization` 或 `openubmc/inspection` 事件的构建会拒绝新版 Session 日志；软件回退使用旧构建的兼容 home。历史 Case 日志仍可读取；适配器不将旧 Case 写接口转换为 Run。参见[升级指南](../../../docs/upgrade-guide/v0.2.0-rc.2/openubmc-runtime-recovery/guide.zh.md)。

<a id="model-experience"></a>
## Model Experience

### 工作流指引与执行结果

#### 模型所见

系统提示词包含：`A response_required Gate requests actual work and evidence; it does not by itself require human approval.`。指引涵盖 Skill 加载、真实提交、原生授权、Goal 续接和未知结果。固定字段的 runtime-context 快照报告已记录的权限及 Run、调用、Gate、Incident 数量，不复制证据或 Gate schema。现有 MCP 工具返回 `The requested Run does not belong to this Session.` 等绑定错误，并保留完整结构化结果，包括失败的 Turn。插件不增加工具。

#### Token 影响

静态指引计入系统提示词。已记录权限或数量变化时追加 runtime-context 快照；先前快照继续保留在日志中。工具结果保留原有文本和结构化 JSON，因此指引不会重复其证据数据。

#### KV Cache 影响

未变化的静态指引保留在可复用的请求前缀中。动态上下文和工具结果追加到历史；修改静态指引会改变系统提示词。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **访问策略** — 适配器保护当前 DSH 桥，直接访问 Runtime 需要独立的访问策略。不能通过模型生成的标识接管外部 Run。
- **观察时效** — 观察反映最近返回的结果，可能已经过期。DSH 只保存关联和投影，不维护第二套工作流或设备变更日志。
- **阶段工作** — 指引不证明代码变更、检查或诊断有效。Agent 必须实际完成工作，并向 Runtime 提交真实证据。

<a id="dev-note"></a>
### 开发备注

不发布 invariant 配套模块：授权来自可重建的 Session 投影，没有独立维护的状态库。
