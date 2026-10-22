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
dsh plugin --profile web add /absolute/path/dsh-openubmc-0.4.0.tgz
dsh --profile web --no-open --host 127.0.0.1 --port 3080
```

打开 DSH 打印的认证 URL。通过 DSH 现有设置配置自己的模型。目标凭据和 Runtime 历史保存在选定的 `DSH_HOME` 中，位于插件目录之外；知识库凭据沿用 openUBMC 现有用户配置。归档不携带账号、模型密钥或设备授权。加载 profile 不会发送设备操作。Web 插件页也可通过软件包规格输入框安装同一归档。

将 `DSH_HOME` 和工作区放在 `/tmp` 之外的持久目录。沙箱 shell 可能使用私有临时目录，无法执行保存在 Host `/tmp` 中的 Skill 脚本。

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

打开设置 → 插件 → dsh-openubmc，通过当前已认证的 Web 地址配置设备、知识库或 Conan 账号。本地或 headless Host 可用 `/openubmc-configure [targets|kb|conan]` 在该 Host 打开私有回环配置页。保存会激活私有配置版本，不会连接设备；连接和登录检查由用户在页面显式执行。`/openubmc-doctor` 检查安装包完整性、本地模块加载和配置元数据。`/openubmc-repair [runtime|kb|all]` 修复自有依赖并重试不可用的服务。服务故障时仍保留配置工具；Python 可执行文件缺失时需修正插件配置。修复保留 Run 和用户设置。

Developer Skill 包含来自 openUBMC 插件 2.1.9 的固定版本社区源码检查和接口文档覆盖资源，`release.json` 记录其来源。这些资源提供本地建议性检查；Runtime Gate 仍需实际证据。

## 工作区与记录

Host 在 Run 启动前选择 Session 工作目录，Runtime 冻结其仓库身份。`/openubmc-records` 读取 Session 交接记录，`export` 写入私有脱敏文档，`verify <filename>` 校验摘要。`test <JSON>` 在冻结的干净仓库中运行命令并记录测试回执；源码漂移或其他 Session 的 Run 会被拒绝。字段为 `runId`、`repoRef`、`commandRef`、`argv` 和可选的秒数 `timeout`。`answer <run-id>` 读取 Runtime 准备的最终回答；只有匹配的已提交最终文本才确认交付。Session 用量记录是不完整的观测，不能证明完整的提供方请求清单或自动归因到 Run。

旧官方 headless runner 不派发斜杠命令。请让 Agent 使用 `openubmc_setup_status`、`openubmc_setup_prepare`、`openubmc_setup_open_configuration` 和绑定当前 Session 的 `openubmc_records` 工具。Web 对话支持上文的原生命令。

完整 Skill 清单包含文档审查和离线日志包分析。文档扫描器只提取命令，不执行文档中的命令；语义和产品一致性检查仍需相应证据。离线日志分析支持有界解包、时间线、事件关联、结构化摘要和目录覆盖审计，远程采集仍由日志采集 Skill 负责。

`/openubmc-operator tools` 列出 Runtime 运维操作；`/openubmc-operator <operation> <JSON>` 按公布的 schema 调用。它提供证据查询与附加、重放、Outcome 审查与提升，以及已解决 Case 的生命周期管理，具有当前安装范围的管理访问权限。这是原生用户命令，不进入模型工具清单，也不提供 Agent 或领域执行操作。完整结构化失败保留在命令历史中。

`/openubmc-records prune <JSON>` 预览导出记录清理，`beforeTimestamp` 使用 UTC epoch 秒数；`apply: true` 只删除符合条件的自有导出。可成对配置 `providerReportFile` 和 `providerRef`，选择可信的持久化 `openubmc.provider-requests/v1` 报告。只有完整、身份匹配且包含明确 Run 引用的请求清单才能提供完整 Run 用量。报告缺失、冲突或不完整时保留未知或部分状态；默认 Session 观测不会推断 Run 归属。

旧版 headless runner 可通过 `python3 <installed-package>/payload/runtime_operator.py --state-dir <private-state> --credentials-file <private-selector> --session-id <session>` 管理同一私有状态，无需模型推理。默认列出运维操作；添加 `--operation <name> --arguments '<JSON>'` 调用公布的操作。辅助程序验证安装包完整性，操作失败时返回非零退出码。

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
dsh plugin --profile headless add /absolute/path/dsh-openubmc-0.4.0.tgz
dsh --profile headless --patch /absolute/path/preflight.yml "Validate Agent preflight."
```

成功时打印 `OPENUBMC_OFFLINE_OK`。检查在没有模型或设备凭据时验证工具发现和结构化失败保留，不验证远程登录或知识检索。

使用相同 `add` 命令安装较新归档即可更新。重新安装保留的兼容归档可恢复其插件代码；修改软件版本时保留 DSH home 备份。使用 `dsh plugin --profile web remove dsh-openubmc` 移除 bundle。移除会保留会话、目标凭据和 Runtime 状态。新插件 Session 使用标准 Host 事件，移除后仍可读取。Host 自身的 Session 格式降级规则仍然适用。
