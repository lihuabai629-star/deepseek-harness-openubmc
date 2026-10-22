---
description: "从本地工作流源码创建隔离的 openUBMC 开发配置。"
kind: "tutorial"
---

# openUBMC 开发配置

[English](README.md) | 中文

此配置将 DSH 连接到现有 `openubmc-agent-workflow` 源码中的 Python Target Runtime 和 Node 知识库 MCP。需要 Linux/WSL、Python 3、工作流的 Python 依赖、KB 已安装的 Node 依赖，以及 DSH 仓库支持的 Node 和 pnpm 版本。

## 分发可安装插件

[插件安装说明](distribution/README.zh.md)介绍通过 `dsh plugin` 安装的方法，使用者不需要源码 checkout。从干净的工作流 checkout 构建归档；载荷仅包含 Git 跟踪的 Skill 资源、Runtime 和 KB 源码。软件包包含预构建适配器，没有安装脚本。元数据记录已验证的官方 Host 版本和工作流修订。可移植提供方复用原生授权归约器，并拥有私有 Session 关联；下文开发配置保留原生 Host 集成。

```sh
corepack pnpm exec tsx scripts/openubmc/pack.ts \
  --workflow /absolute/path/openubmc-agent-workflow \
  --out /absolute/path/artifacts --version 0.3.1
python3 scripts/openubmc/verify_plugin.py \
  --archive /absolute/path/artifacts/dsh-openubmc-0.3.1.tgz \
  --dsh /absolute/path/dsh/apps/cli/lib/bin.js
```

验证器使用源码目录之外的临时 home，在无密钥预检后移除插件。通过 `--update-archive` 传入另一插件版本，还可验证更新与恢复。它不连接设备或模型端点。[环境 Skill 快照](../../snapshots/session/openubmc-environment-skill/snapshot.yml)记录传给模型的 DSH 专用配置说明。已有托管 profile 继续使用下文的独立生命周期；不要在同一 profile 中同时启用两种集成。

`verify_web.py --archive <archive> --dsh <official-bin.js> --node <node>` 检查认证 Web 资源、私有配置代理、Origin 和页面 token 拒绝、本地激活及诊断，不访问目标。portable bundle 拥有其配置进程和私有依赖缓存。Host 记录桥复用固定版本 Runtime 存储，提供可信工作区捕获、测试回执、导出和最终交付；Session 用量明确标为不完整。打包器叠加 `supplement/source.json` 列出的源码检查资源，并在 `integrity.json` 中记录发行包自有文件清单。

打包的 Skill 使用 `stateDir/skill-resources` 下按内容摘要寻址的私有资源。Markdown 命令将 Skill 逻辑名解析为同一版本的目录，覆盖嵌套参考文档。脚本保留源文件字节和执行权限。加载会校验已有版本并拒绝修改过的资源。软件包更新或移除会将这些资源与 Runtime 历史一起保留。

便携插件包含 full 配置的文档审查和离线日志分析。原生运维命令和提供方报告配置见[安装指南](distribution/README.zh.md)。

## 创建和启动

在 DSH 仓库中运行，指定一个尚不存在的 home 路径：

```sh
python3 scripts/openubmc/init.py \
  --workflow /home/workspace/openubmc-agent-workflow \
  --home /tmp/dsh-openubmc-dev \
  --node /opt/node-v24.19.0/bin/node
export PATH=/opt/node-v24.19.0/bin:$PATH
export DSH_HOME=/tmp/dsh-openubmc-dev
corepack pnpm dsh --profile openubmc --dump-config
corepack pnpm dsh --profile openubmc "Inspect the openUBMC Agent tool schemas."
```

执行最后一条命令前，通过 DSH 现有凭据设置或环境配置模型。`--template web` 选择 Web bundle，使用 DSH 原生对话和工具历史；添加 `--case-ui` 可启用可选的 Run、回执和历史 Case 卡片。使用 `corepack pnpm dsh --profile openubmc --no-open --port 0` 分配独立的本机回环端口。仅通过 `dsh` 启动；初始化脚本不会启动服务或请求模型。

初始化脚本拒绝已有 home。它创建 `profiles/openubmc/cordis.patch.yml`、私有 Runtime 状态目录位置，以及包含清单 full 配置全部技能的 Skill 根目录。Skill 名称遵循清单映射；Markdown 文件（含嵌套参考文档）中已知的 home 相对脚本路径会替换为源码路径。其他支持文件通过符号链接指向源码。Markdown 或清单变化后，重新创建一个新 home。工作流和 DSH 源码目录必须保持可用；profile 链接此 DSH 源码中的 Runtime 和观察包。未启用可选卡片时，仍可使用会话记录、`/run` 和 `/case`。

## 离线启动检查

选定生成的 home 后，使用脚本化模型检查两个 MCP 服务均已发现工具，并向 `observe` 提交缺少目标的查询，要求 Runtime 在访问设备前拒绝：

```sh
corepack pnpm dsh --profile openubmc \
  --patch scripts/openubmc/offline.patch.yml "Validate Agent preflight."
```

成功运行会在收到结构化 Agent 预检错误后输出 `OPENUBMC_OFFLINE_OK`。该检查无需模型凭据或设备访问，验证源码配置、MCP 工具发现和模型可见结果投影；不验证知识检索或真实模型决策。工作流源码中必须已安装 Runtime 和 KB 依赖。

[openUBMC CI 工作流](../../.github/workflows/openubmc.yml) 在 GitHub 托管 Linux runner 上检查拉取请求和 `main` 推送。它构建 DSH，使用固定版本的 Python Runtime 源码检查原生 MCP、Case、授权和恢复行为，重放已记录的 Session 与 SDK 输出，并验证托管 profile 和便携插件生命周期。常规检查在 Actions 摘要中记录包校验和，不上传工件。本地 Python SDK 检查从 `PATH` 解析受支持的 Node 可执行文件；CI 使用本指南旁带哈希校验的 Python 依赖锁文件。

手动触发时，`full_qualification` 还运行 Web 查看和官方 Host 兼容性矩阵。非空的 `release_tag` 要求这些完整验证通过，并将插件和校验和附到已有的草稿 Release，其标签必须指向受测提交。工作流不会发布 Release。常规检查通过不代表 Web 或完整 Host 矩阵已通过验证。这些检查不使用模型、KB 或设备凭据，也不验证真实提供方或固件兼容性。

## 身份与恢复

MCP 桥将调用方 Session ID 注入 `params._meta.taskId`。恢复同一 Session 时，Host 和 MCP 重启后仍沿用该 ID；fork 使用不同 ID。没有 Agent 的调用会在分发前失败。模型参数无法替换请求元数据。Runtime 负责 Run 标识、工作流状态和证据。MCP 桥将完整结构化结果保留在文本和持久化元数据中，包括失败结果。[观察插件](../../packages/experimental/openubmc-cases/README.zh.md) 提供只读 `/run` 和历史 `/case` 查询；它们不访问设备，也不推进执行。

此配置选择原生 Agent 接口和独立的 `openubmc-agent-state` 目录。execute 调用方最多等待 120 秒，observe 最多等待 180 秒，MCP 预算为 190 秒。长动作续接由 Runtime 管理。后续 execute 动作沿用返回的 Run 标识和 Gate 绑定，未知动作结果通过 Runtime 核对。取消不代表回退。

Agent 加载当前阶段的 Skill，完成工作，并向返回的 Gate 提交真实证据。证据 Gate 本身不要求用户批准。明确要求持续工作的任务使用 DSH 原生 Goal 工具；Session 重启后，需要用户要求继续并重新激活 Goal。打开对话或查看历史不会发送设备动作。

## 凭据与限制

Runtime 使用此 home 中的 `credentials.env` 选择器，初始文件不存在，不使用生产凭据文件。访问设备前需显式配置。KB 保留现有登录和配置机制；创建配置不代表完成 KB 登录。MCP 客户端的环境变量清洗仍然生效。

[Runtime 适配器](../../packages/experimental/openubmc-runtime/README.zh.md) 在发送前将 Runtime 返回的 Run 绑定到启动它的 Session。默认的只读诊断无需执行授权。有效的 start 超出现有权限时，通过 DSH 原生提问服务请求授权；批准只允许该次原输入启动及其返回 Run 的后续阶段。Resume 保留已记录的权限；fork 继承观察，但不继承授权或 Run 写权限。已有生产配置和 systemd 服务不属于初始化器的管理范围。

需要直接授予范围权限时，在所属对话中输入 `/target-authorize execute <target> <intent> [source-only|live-patch|build-upgrade]`。在 headless profile 中，通过 `corepack pnpm dsh --profile openubmc --session-id <id> "<command>"` 传入命令；Web 在对话输入框中接受命令。原生命令不调用模型。使用 `/target-authorize revoke` 撤销授权。适配器参考页说明更广的授权及高级 `/target-action` 续接方式。已有 Run 使用 `control` 核对；启动回包丢失时，先执行 `/target-reconcile <original-call-id>`，再按原输入重放。

## 托管 profile 生命周期

管理器只拥有 `@local/dsh-openubmc`、它在 profile 中的依赖和 bundle 列表条目，以及记录的链接。用户模型设置、MCP 配置及 `cordis.patch.yml` 仍由用户拥有。所有操作与 DSH 插件管理器使用相同的 profile 写锁；仍在运行或无法确认的持锁者会导致带锁路径的错误；已确认退出的 PID 按原生 claim 协议恢复。使用独立 home，并在生命周期操作前停止该 home 的 Host，使每个进程只观察一代配置。

```sh
python3 scripts/openubmc/manage.py install --home /tmp/dsh-openubmc-managed \
  --workflow /home/workspace/openubmc-agent-workflow \
  --node /opt/node-v24.19.0/bin/node
python3 scripts/openubmc/manage.py check --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py update --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py rollback --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py repair --home /tmp/dsh-openubmc-managed
python3 scripts/openubmc/manage.py uninstall --home /tmp/dsh-openubmc-managed
```

`--template web` 使用 DSH 原生对话。在 install 或 update 时添加 `--case-ui` 可启用诊断卡片，使用 `update --no-case-ui` 可停用。启用卡片要求 Web profile。每代记录此选择，更新保留显式记录的选择。缺少该字段的旧配置代更新时采用原生对话默认值，修复和回滚则保留其原有卡片配置。

每代配置复制 manifest 完整 Skill 集合及其脚本和参考文件，将支持文件的符号链接复制为自有文件，并把已知 Skill 路径改写到自有副本。同时复制相邻 Skill 辅助脚本依赖的 Runtime Python 包，不额外注册 Skill。这些支持文件参与同代配置的完整性检查与修复。更新时保留选定的 Node/Python 路径和凭据选择器，除非显式替换。缺失的自有条目可修复；外部替换的依赖值、文件或链接会在修改 profile 前被拒绝。每代记录解释器路径和凭据选择器，回滚恢复这些选择。激活在发布链接前记录所有权，并对 profile 写入失败执行补偿；修复可根据所有权记录重建整代丢失的配置。

修复在重建缺失内容前还会验证选定配置代的 workflow manifest 和 Skill 源文件摘要；源文件变化时须恢复相应 checkout，或显式更新。

回滚恢复 profile/Skill 配置，不恢复可执行软件。Runtime、KB 和 DSH 代码仍保留在各自 checkout 中；摘要固定适配器和 Runtime/KB 启动文件、原生包源码与构建产物，以及依赖锁文件。`check`、修复和回滚会拒绝已变化的固定文件。使用 update 选择变化后的执行代码，或先恢复预期 checkout 再回滚。此检查不验证模型端点、KB 登录或设备连接。卸载保留会话、Runtime 状态、凭据、用户配置和各代配置。

以下记录覆盖旧 Runtime 接口，不代表 Agent 接口已通过验证。[提供方资格验证记录](qualification/2026-10-11.json) 包含真实模型与 KB 检索、持久化 Runtime 阶段和工件观察，以及离线设备后端的进程重启续接结果。独立的[真实目标记录](qualification/2026-10-11-real-target.json) 覆盖 A860 A5 上的诊断、MDB 身份核对、临时文件 Apply、DSH 重启和校验和保护回退。两份记录均不代表业务验收或固件升级兼容性，也不包含凭据和原始设备日志。

[原生目标验收记录](qualification/2026-10-19-target39.json)覆盖真实 Agent 诊断、临时文件 Apply/Rollback，以及设备写入完成但宿主回包丢失后的恢复。记录确认重启后仍使用同一 Run，且只有一份变更日志。该记录不验证业务字节码兼容性或固件激活。

[原生对话记录](qualification/2026-10-19-native-conversation.json)覆盖真实模型通过 Skill 和 Goal 使用真实 Python Runtime 及离线设备后端。它保留同一 Run 并如实记录证据 Gate 失败；重新打开同一 Session 不会发送新的 execute 动作。该记录不验证物理 BMC 的诊断。

[原生业务验证记录](qualification/2026-10-20-business.json)覆盖源码与字节码匹配、两次 Apply 和已观察到的 NC-SI 诊断执行。操作员通过受校验保护的补偿恢复原备份；Runtime 核对与 DSH 原生 resume 确认既有回退 Run 和 Effect 已完成。该记录保留既有 NC-SI 错误和四个端口断开状态，不验证全自动业务回退或固件激活。

独立的[原生恢复验证记录](qualification/2026-10-20-recovery.json)覆盖了无需操作员补偿的业务 Apply 和显式 Rollback，随后重新核查原始校验值、元数据、框架和四个端口。受控丢弃已验证的临时文件回退回执，并拒绝前两次恢复调用后，三个 Runtime 进程始终保留同一个 Run 和 Effect；最终核查完成，设备变更仅派发一次。终态日志重放可以在没有原始回调内容时认可已验证的文件缺失结果。记录明确区分脚本驱动、刻意注入的故障、真实模型自主执行、可移植 Host 验证和固件激活。

## 服务预部署

保留调用者工作目录的源码 CLI wrapper 必须将 `TSX_TSCONFIG_PATH` 设为快照中的 `tsconfig.json`，并加载快照的 `tsx/esm` hook。工作区导入依赖这些源码映射；仅使用 CLI 绝对路径不会选中它们。

使用独立 systemd unit、私有 home 和本机回环端口验证源码部署。认证 URL 和服务日志须保持私有。修改 profile 生命周期前，先停止该实例。安装时选择的模板决定应用入口，update 保留该入口。使用另一个 headless profile 从 CLI 查看私有 Case 快照，不向 Web 入口传递 headless 参数。

软件回退选择旧的可执行文件及其兼容 home。不认识必需 `openubmc/authorization` 或 `openubmc/inspection` 事件的构建会拒绝新 Session 日志；保留候选 home 用于恢复，不用旧构建打开它。一致的状态快照使用 SQLite backup，并排除复制的进程锁。[部署记录](qualification/2026-10-11-deployment.json) 报告了托管 CI、独立服务重启、原生 Case 连续性、旧 Runtime 启动和源码 Runtime 恢复。正式服务不属于该演练。

[正式部署记录](qualification/2026-10-11-production.json) 包含独立源码快照重建、文件和依赖解析链接校验、已安装的回环服务、原生 Case 刷新与重载、真实模型和 KB 调用，以及旧 Runtime 回退。软件回退使用保留的旧 Runtime 及其独立 home，并保留新版 Session 文件以便恢复。既有凭据、原 Web profile 和其他用户 MCP 条目继续可用。

[组件验证记录](qualification/2026-10-11-component.json) 报告了使用修复后的开发依赖图运行的 NC-SI 单元测试和本地组件集成入口。[业务热补丁记录](qualification/2026-10-11-business.json) 覆盖 collector、调用方和 I350 配置的校验值匹配、collector 临时替换、四通道查询覆盖，以及通过同一 DSH Session 和 Runtime Case 恢复原文件。这些记录不证明完整固件与源码等价，也不验证固件升级。
