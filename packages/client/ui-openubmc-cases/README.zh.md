---
description: "可选的原生 Web 界面，展示持久化 openUBMC Run、观察回执和历史 Case。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-openubmc-cases

[English](README.md) | 中文

## 概述

此可选 Client 插件在对话中将持久化 Runtime 结果展示为 Case 卡片。Case 状态、操作结果和传输失败分别展示。卡片从经过验证的元数据中显示阶段记录、证据引用、工件指纹和后续动作。

## 目录

- [配置与读取](#configuration-and-inspection)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="configuration-and-inspection"></a>
## 配置与读取

将 `serverName` 配置为与 Host [Case 投影](../../experimental/openubmc-cases/README.zh.md) 相同的可信 MCP 命名空间。[openUBMC Web profile](../../../scripts/openubmc/README.zh.md) 在指定 `--case-ui` 时组合此插件；其 Host 投影和 Runtime 授权也支持不启用卡片的使用方式。默认 Web profile 不加载它。

原生 Run 卡片保留 Gate 标识、版本和响应 schema，Incident 恢复详情，以及 Outcome、事实、缺口和进度。观察回执卡片展示覆盖范围、时效、结果与证据，可展开完整 JSON。历史 Case 卡片保留记录字段，不再提供实时读取控件。

所有卡片都是已记录的观察。后续结果将更早的卡片标为可能过期；fork 继承的卡片保留历史标记。只有当前 Session 最新的 Run 卡片通过原生 Host 命令提供显式授权、续接、取消和核对。续接控件遵循 Host 对当前 Run 的权限判断；只读诊断不需要通用执行授权。Session 授权和撤销仍使用独立控件。Gate 表单保留返回的标识和提交绑定，收集显式响应字段，完整 schema 校验由 Runtime 执行。提交失败时保留草稿。渲染、展开或重新加载卡片不会触发执行。失败结果仍显示为失败；无效或其他来源的元数据使用通用工具展示。

<a id="dev-note"></a>
## 开发备注

Client 拥有 Conversation 定义、按键注册的渲染器和本地化词典。Host 部分只发布配置。没有发布 invariant 配套模块：展示数据全部来自 Session 日志和已有 Host 投影，没有独立的 Case 状态存储。

<a id="model-experience"></a>
## 模型体验

无，因为显式控件调用原生 Host 命令，不触发模型请求。

#### KV 缓存影响

此插件不改变模型请求或可复用前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 卡片展示 Runtime 提供的阶段、证据和工件 JSON，不打开 Host 工件路径，也不提供 Run 创建。过期标记不触发后台轮询。已记录的卡片仍可离线阅读。
