---
description: "从本地工作流源码创建隔离的 openUBMC 开发配置。"
kind: "tutorial"
---

# openUBMC 开发配置

[English](README.md) | 中文

此配置将 DSH 连接到现有 `openubmc-agent-workflow` 源码中的 Python Target Runtime 和 Node 知识库 MCP。需要 Linux/WSL、Python 3、工作流的 Python 依赖、KB 已安装的 Node 依赖，以及 DSH 仓库支持的 Node 和 pnpm 版本。

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
corepack pnpm dsh --profile openubmc "Read the openUBMC runtime status."
```

执行最后一条命令前，通过 DSH 现有凭据设置或环境配置模型。`--template web` 选择 Web bundle；使用 `corepack pnpm dsh --profile openubmc --no-open --port 0` 分配独立的本机回环端口。仅通过 `dsh` 启动；初始化脚本不会启动服务或请求模型。

初始化脚本拒绝已有 home。它创建 `profiles/openubmc/cordis.patch.yml`、私有 Runtime 状态目录位置，以及包含清单 full 配置全部技能的 Skill 根目录。Skill 名称遵循清单映射；支持文件通过符号链接指向源码。Skill 正文中已知的 home 相对脚本路径会替换为源码路径。正文或清单变化后，重新创建一个新 home。工作流和 DSH 源码目录必须保持可用；profile 链接此 DSH 源码中的原生 Case 包。

## 离线启动检查

选定生成的 home 后，使用脚本化模型检查两个 MCP 服务均已发现工具，并且只调用 `runtime_status`：

```sh
corepack pnpm dsh --profile openubmc \
  --patch scripts/openubmc/offline.patch.yml "Read runtime status."
```

成功运行会在收到结构化完成状态后输出 `OPENUBMC_OFFLINE_OK`。该检查无需模型凭据或设备访问，验证源码配置、MCP 工具发现和模型可见结果投影；不验证知识检索或真实模型决策。工作流源码中必须已安装 Runtime 和 KB 依赖。

## 身份与恢复

MCP 桥将调用方 Session ID 注入 `params._meta.taskId`。恢复同一 Session 时，Host 和 MCP 重启后仍沿用该 ID；fork 使用不同 ID。没有 Agent 的调用会在分发前失败。模型参数无法替换请求元数据。Runtime 负责 task 与 Case 的关联、证据和工作流状态；DSH 将返回的结构化数据同时保留为摘要旁的文本和持久化元数据，包括失败结果。[Case 插件](../../packages/experimental/openubmc-cases/README.zh.md)从该元数据派生观察。在原生命令界面使用 `/case` 查看；此查询不调用 Runtime，也不授予执行权限。

此配置给 Runtime 调用 660 秒，允许常规 600 秒诊断截止时间内的操作结束。使用其他领域截止时间时，调整 `toolCallTimeoutMs`。取消和超时不能证明设备操作已经停止或回滚。重试结果不确定的操作前，先读取 Case 和变更记录。

## 凭据与限制

Runtime 使用此 home 中的 `credentials.env` 选择器，初始文件不存在，不使用生产凭据文件。访问设备前需显式配置。KB 保留现有登录和配置机制；创建配置不代表完成 KB 登录。MCP 客户端的环境变量清洗仍然生效。

[Runtime 适配器](../../packages/experimental/openubmc-runtime/README.zh.md) 在发送前实施 Session 派生的 Case 归属检查。设备和工作流执行需要当前 Session 的用户通过 `/target-authorize` 授权；resume 保留授权，fork 排除继承授权。此机制保护 DSH 桥接，不保护对 Python Runtime 的直接访问。已有生产配置和 systemd 服务不属于初始化器的管理范围。

使用 `corepack pnpm dsh --profile openubmc --session-id <id> "/target-authorize debug_run"` 在同一会话授权具体操作。此原生命令不调用模型。使用 `/target-authorize revoke` 撤销授权。
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

`--template web` 添加可选的原生 Case 卡片。每代配置复制 manifest 完整 Skill 集合及其脚本和参考文件，将支持文件的符号链接复制为自有文件，并把已知 Skill 路径改写到自有副本。更新时保留选定的 Node/Python 路径和凭据选择器，除非显式替换。缺失的自有条目可修复；外部替换的依赖值、文件或链接会在修改 profile 前被拒绝。每代记录解释器路径和凭据选择器，回滚恢复这些选择。激活在发布链接前记录所有权，并对 profile 写入失败执行补偿；修复可根据所有权记录重建整代丢失的配置。

修复在重建缺失内容前还会验证选定配置代的 workflow manifest 和 Skill 源文件摘要；源文件变化时须恢复相应 checkout，或显式更新。

回滚恢复 profile/Skill 配置，不恢复可执行软件。Runtime、KB 和 DSH 代码仍保留在各自 checkout 中；摘要固定适配器和 Runtime/KB 启动文件、原生包源码与构建产物，以及依赖锁文件。`check`、修复和回滚会拒绝已变化的固定文件。使用 update 选择变化后的执行代码，或先恢复预期 checkout 再回滚。此检查不验证模型端点、KB 登录或设备连接。卸载保留会话、Runtime 状态、凭据、用户配置和各代配置。

[提供方资格验证记录](qualification/2026-10-11.json) 包含真实模型与 KB 检索、持久化 Runtime 阶段和工件观察，以及离线设备后端的进程重启续接结果。独立的[真实目标记录](qualification/2026-10-11-real-target.json) 覆盖 A860 A5 上的诊断、MDB 身份核对、临时文件 Apply、DSH 重启和校验和保护回退。两份记录均不代表业务验收或固件升级兼容性，也不包含凭据和原始设备日志。
