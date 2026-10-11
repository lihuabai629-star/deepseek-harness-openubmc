---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-11-openubmc-inspection

[English](2026-10-11-openubmc-inspection.md) | 中文

## 概述

为原生 Case 和证据读取新增必读的 openubmc/inspection Session 事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-openubmc-inspection
baseline: false
changes:
  - root: "event:openubmc/inspection"
    previous: null
    after: "b5c198b8330ec00a6febc83b94c3b93313125266da8d5a8596f008e25d33aa46"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志仍可读取。包含此事件的日志要求识别它的构建；旧读取器按必读事件拒绝。新增声明事件不改变 Session 外层结构或格式版本。

<a id="verification"></a>
## 验证

原生 Case 读取、取消和卸载测试通过。TypeScript 和 Python SDK 通知快照保留读取元数据，且不进入模型转录。

<a id="dev-note"></a>
## 开发备注

无。
