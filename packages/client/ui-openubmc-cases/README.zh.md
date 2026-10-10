---
description: "可选的原生 Web 界面，展示持久化 openUBMC Case 观察并读取有界证据。"
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

将 `serverName` 配置为与 Host [Case 投影](../../experimental/openubmc-cases/README.zh.md) 相同的可信 MCP 命名空间。[openUBMC Web profile](../../../scripts/openubmc/README.zh.md) 组合 Host 投影、Runtime 授权和此插件。默认 Web profile 不加载它。

刷新 Case 和证据按钮通过命令 Remote 调用该 Session 的原生命令 `/case-refresh` 和 `/evidence`。它们需要 [Runtime 适配器](../../experimental/openubmc-runtime/README.zh.md)，不会请求模型推理或授予目标执行权限。适配器负责证据读取限制和 Case 隔离。原生读取结果进入持久化对话历史，重新加载页面时会重建卡片。

每张卡片都是历史观察。除最新完整 Case 读取外，观察会标记为可能过期。fork 继承的卡片保留历史标记，并禁用实时操作；读取 fork 的新 Case 会产生独立的当前观察。即使后续 Case 查询成功，操作错误仍明确显示为失败。无效或来自其他源的元数据使用通用工具展示。

<a id="dev-note"></a>
## 开发备注

Client 拥有 Conversation 定义、一个按键注册的渲染器、本地化词典和原生命令回调。Host 部分只发布配置。没有发布 invariant 配套模块：展示数据全部来自 Session 日志和已有 Host 投影，没有独立的 Case 状态存储。

<a id="model-experience"></a>
## 模型体验

无，因为此插件只展示持久化 Case 元数据，并调用非模型读取命令。

#### KV 缓存影响

此插件不改变模型请求或可复用前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 卡片展示 Runtime 提供的阶段、证据和工件 JSON，不打开 Host 工件路径，也不实现设备操作控件。过期标记不触发后台轮询。Case 查询需要可达的 Runtime；历史卡片仍可离线阅读。
