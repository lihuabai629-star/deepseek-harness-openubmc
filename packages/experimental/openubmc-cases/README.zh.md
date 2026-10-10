---
description: "从持久化工具元数据读取已观察到的 openUBMC Case 信息。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-cases

[English](README.md) | 中文

## 概述

此可选插件从 Session（会话）工具结果投影已观察到的 openUBMC Case（案例），并注册只读命令 `/case [case-id]`。Runtime 仍是状态权威；视图展示最近观察到的结果（包括失败），并标记 fork（分叉）继承的观察。插件不调用 Runtime，也不授予执行授权。

## 目录

- [配置与使用](#configuration-and-use)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration-and-use"></a>
## 配置与使用

`serverName` 选择持久化元数据中的确切 MCP 命名空间；历史查询不需要在线 MCP 连接。采集新观察时，启用对应客户端的 `structuredContentInMeta`。[开发 profile（配置档）](../../../scripts/openubmc/README.zh.md)组合这两项设置。`/case` 列出已观察到的 Case；`/case case-7` 选择其中一个。未知 ID 返回错误。命令不会发起模型请求或查询设备。

`openubmc/cases` Session 投影公开每个 Case 的最近观察：修订号、已报告的 Case 状态、操作状态、原始工具名、失败标志、证据引用、后续动作、事件序号及继承标志。JSON 类型通过 `./types` 导出。重启时投影从已有 `tool/result` 元数据重建；checkpoint（检查点）仅是派生缓存。仅接收 v1 agent-envelope 模式。存在 `agent_envelope` 时从中读取操作状态；Case 状态来自 context-runtime Case 投影或 capsule（状态摘要），未报告前保持未知。成功的状态和证据读取保留已知 Case 状态及恢复信息。完整 Case 读取替换已报告的 Case 字段；其他操作未报告证据引用时保留已有引用。格式错误的 Case 字段留下可见诊断，并保留上一次有效观察；后续有效观察会清除诊断。没有 Case ID 的结果及其他服务器的结果不改变视图。继承的 Case 信息保持标记，直到当前会话的完整 Case 报告替换它。

每个组合仅注册一次此插件。卸载会移除命令和投影注册。插件没有 invariant（不变量）伴随模块：唯一状态是 Session 日志的纯投影，没有独立维护且可能偏离的 Case 存储。

完整 Case 读取保留 Runtime 的阶段记录和工件修订，包括 agent envelope capsule 中提供的修订。`/case` 展示这些观察以及证据和后续动作。原生读取与工具结果使用同一投影归约。

<a id="model-experience"></a>
## 模型体验

无，因为此插件公开用户命令和 Session 投影，不添加模型工具或上下文。

#### KV Cache 影响

不直接改变模型请求或可复用前缀；MCP 客户端拥有模型可见的工具内容。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **观察新鲜度** — `/case` 不刷新 Runtime 状态。其他会话或外部动作可能在最后一次记录后改变 Case。
- **执行权限** — 继承观察是标记，不是归属检查。设备执行验证前，Runtime 调用仍需落实 task（任务）归属和 fork 授权检查。
- **结果覆盖** — 仅观察顶层 `tool/result` 元数据，不包含 PTC（程序化工具调用）子分发。
- **展示** — 投影可供传输层消费，但不提供专门的 Web Case／证据卡片。

<a id="dev-note"></a>
### 开发备注

无。
