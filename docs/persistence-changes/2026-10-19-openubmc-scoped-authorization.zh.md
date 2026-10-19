---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-19-openubmc-scoped-authorization

[English](2026-10-19-openubmc-scoped-authorization.md) | 中文

## 概述

记录单个 openUBMC 启动请求及其返回 Run 的用户精确授权。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-19-openubmc-scoped-authorization
baseline: false
changes:
  - root: "event:openubmc/authorization"
    previous: null
    after: "55ed7784f0210713e093a3f5d4baacb60b8a48cf5c7fbdb92604e6c587a481cf"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增必需的仅日志事件，不改变已有载荷或写入格式。不识别 openubmc/authorization 的构建会拒绝受影响的 Session。授权投影仅从当前 Session 中匹配的待处理启动请求重建权限；fork 继承不授予执行权限。投影缓存可以重建。

<a id="verification"></a>
## 验证

定向的归属、恢复、范围和引导测试通过，其中包含修改调用等待限制后的重启恢复。真实 Loader 组合通过锁定的 Python Runtime 到达原生授权并持久化决策。

<a id="dev-note"></a>
## 开发备注

无。
