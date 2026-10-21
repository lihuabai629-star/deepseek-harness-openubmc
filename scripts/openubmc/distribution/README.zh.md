---
description: "将打包的 openUBMC 工作流安装到 DSH profile。"
kind: "tutorial"
---

# DSH openUBMC 插件

[English](README.md) | 中文

将 `dsh-openubmc` 安装到已有 Web 或 headless profile。归档包含原生适配器、Python Runtime、知识库 MCP 和完整工作流 Skill 资源。使用者不需要工作流或 DSH 源码 checkout。需要 Node 24、Python 3.10 或更高版本、pnpm 和 Linux/WSL；目标操作还需要工作流选择的传输工具，例如密码 SSH 使用的 OpenSSH 和 sshpass。

## 安装与启动

使用官方 DSH `0.1.7-rc.2`、`0.2.0-rc.2` 或 `0.2.1-rc.2` 安装版和已下载的插件归档。仅这些完整版本已通过验证；其他版本在通过验证前会被启动检查拒绝。无需定制 Host。`release.json` 记录构建归档所用的源码版本。修改软件包前先关闭所选 profile 的 Host。

```sh
dsh plugin --profile web add /absolute/path/dsh-openubmc-0.2.0.tgz
dsh --profile web --no-open --host 127.0.0.1 --port 3080
```

打开 DSH 打印的认证 URL。通过 DSH 现有设置配置自己的模型。目标凭据和 Runtime 历史保存在选定的 `DSH_HOME` 中，位于插件目录之外；知识库凭据沿用 openUBMC 现有用户配置。归档不携带账号、模型密钥或设备授权。加载 profile 不会发送设备操作。Web 插件页也可通过软件包规格输入框安装同一归档。

## 本地配置

bundle 添加一个 `openubmc` 条目。在 profile 的 `cordis.patch.yml` 中覆盖解释器路径或私有数据位置：

```yaml
- id: openubmc
  config:
    python: /absolute/path/venv/bin/python3
    node: /absolute/path/node
    credentialsFile: /private/path/credentials.env
    stateDir: /private/path/openubmc-agent-state
    kbEnabled: true
```

没有覆盖时，Python 通过 `python3` 解析，Node 使用 Host 的独立可执行文件，凭据和 Runtime 状态使用选定 DSH home 下的 `credentials.env` 和 `openubmc-agent-state`。Electron 或单可执行文件宿主需要显式指定独立 Node 路径。对话中仍可使用原生 `/run`、`/case`、执行授权和恢复命令。bundle 使用原生对话视图；其环境 Skill 管理 DSH 软件包和私有配置。

## 会话授权与恢复

插件拥有 observe/execute 桥，并注入可信 Session 与操作标识。成功和失败的完整结构化结果均保留在原生工具日志中。Runtime 仍是 Run、Gate、Incident 和设备副作用的权威。

执行权限、Run 关联和未完成调用保存在安装包外的 `stateDir/dsh-sessions`。备份时应将此目录与 Runtime 状态、DSH Session 一并保存。记录经过校验，以仅所有者可访问的权限写入，并在派发前同步到磁盘；跨进程锁防止同一 Session 重叠执行。已有执行记录而授权数据缺失或损坏时拒绝继续。写入进程必须位于同一宿主与文件系统；不支持跨 PID 命名空间或网络宿主共享数据。

Resume 保留同一 Session 关联。Fork 使用独立授权，不能续接父会话的 Run。原生 `/target-authorize` 命令授予或撤销执行范围；精确 Run 授权使用原生提问服务。超时、取消或断线后，在核对同一 Run 前仍视为执行结果未知。未获响应的 start 使用 `/target-reconcile <original-call-id>` 后精确重放，并保留原操作标识。重连不会自动重试副作用。

早期 `0.1.0` 插件使用必需的自定义 Session 事件。请将其会话保留在原兼容 Host 和 home 中，使用本插件时新建 Session。重装旧归档会恢复旧代码，但不会转换新版授权或 Session 数据。

## 检查、更新和移除

安装到独立 headless profile 执行无密钥预检。创建包含以下内容的 `preflight.yml`；脚本化提供方仅提交无效观察，不连接目标：

```yaml
- id: llm-deepseek
  disabled: true
- insert:
    - id: openubmc-offline-model
      name: dsh-openubmc/preflight
```

```sh
dsh plugin --profile headless add /absolute/path/dsh-openubmc-0.2.0.tgz
dsh --profile headless --patch /absolute/path/preflight.yml "Validate Agent preflight."
```

成功时打印 `OPENUBMC_OFFLINE_OK`。检查在没有模型或设备凭据时验证工具发现和结构化失败保留，不验证远程登录或知识检索。

使用相同 `add` 命令安装较新归档即可更新。重新安装保留的兼容归档可恢复其插件代码；修改软件版本时保留 DSH home 备份。使用 `dsh plugin --profile web remove dsh-openubmc` 移除 bundle。移除会保留会话、目标凭据和 Runtime 状态。新插件 Session 使用标准 Host 事件，移除后仍可读取。Host 自身的 Session 格式降级规则仍然适用。
