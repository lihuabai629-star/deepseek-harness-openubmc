---
kind: upgrade-guide
description: 可安装 openUBMC bundle 在软件包外保存 Session 授权，并使用官方 Host API。
---
# 可移植 openUBMC 授权

[English](guide.md) | 中文

## 变更

`dsh-openubmc` bundle 在已验证的官方 Host 上使用自有 MCP 提供方和私有 Session 关联记录。早期 `0.1.0` bundle 依赖自定义 Host 事件。两种授权存储不能互换；移除插件不会转换其 Session。

## 迁移

1. 为已有自定义事件 Session 保留原兼容 Host 和 home，备份其 Runtime 状态与凭据。可移植 bundle 使用新的 Session。
2. 选择[安装说明](../../../../scripts/openubmc/distribution/README.zh.md)列出的官方 Host 版本，停止所选 profile，然后使用 `dsh plugin --profile web add /absolute/path/dsh-openubmc-0.2.0.tgz` 安装新归档。保留已有模型设置和无关 MCP 条目。
3. 每次备份都将 `stateDir/dsh-sessions` 与 Runtime 状态、DSH Session 一并保存。已有执行后授权数据缺失或损坏会阻止派发；恢复匹配记录，不要删除记录或编造 Run 绑定。Fork 需要独立的 Run 和权限。
4. 在隔离 profile 按说明运行无密钥预检。确认 `OPENUBMC_OFFLINE_OK` 后，在新 Session 使用正常的范围授权。未知调用仍需使用原标识核对后，才能继续其他副作用。
