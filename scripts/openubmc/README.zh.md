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

执行最后一条命令前，通过 DSH 现有凭据设置或环境配置模型。`--template web` 选择 Web bundle；如果已有其他 Web 服务运行，应在生成的配置中设置监听端口后再启动。仅通过 `dsh` 启动；初始化脚本不会启动服务或请求模型。

初始化脚本拒绝已有 home。它创建 `profiles/openubmc/cordis.patch.yml`、私有 Runtime 状态目录位置，以及包含清单 full 配置全部技能的 Skill 根目录。Skill 名称遵循清单映射；支持文件通过符号链接指向源码。Skill 正文中已知的 home 相对脚本路径会替换为源码路径。正文或清单变化后，重新创建一个新 home。源码目录必须保持可用。

## 离线启动检查

选定生成的 home 后，使用脚本化模型检查两个 MCP 服务均已发现工具，并且只调用 `runtime_status`：

```sh
corepack pnpm dsh --profile openubmc \
  --patch scripts/openubmc/offline.patch.yml "Read runtime status."
```

成功运行会在收到结构化完成状态后输出 `OPENUBMC_OFFLINE_OK`。该检查无需模型凭据或设备访问，验证源码配置、MCP 工具发现和模型可见结果投影；不验证知识检索或真实模型决策。工作流源码中必须已安装 Runtime 和 KB 依赖。

## 身份与恢复

MCP 桥将调用方 Session ID 注入 `params._meta.taskId`。恢复同一 Session 时，Host 和 MCP 重启后仍沿用该 ID；fork 使用不同 ID。没有 Agent 的调用会在分发前失败。模型参数无法替换请求元数据。Runtime 负责 task 与 Case 的关联、证据和工作流状态；DSH 将返回的结构化数据作为摘要旁的文本写入日志，包括失败结果，不创建另一套工作流状态机。

此配置给 Runtime 调用 660 秒，允许常规 600 秒诊断截止时间内的操作结束。使用其他领域截止时间时，调整 `toolCallTimeoutMs`。取消和超时不能证明设备操作已经停止或回滚。重试结果不确定的操作前，先读取 Case 和变更记录。

## 凭据与限制

Runtime 使用此 home 中的 `credentials.env` 选择器，初始文件不存在，不使用生产凭据文件。访问设备前需显式配置。KB 保留现有登录和配置机制；创建配置不代表完成 KB 登录。MCP 客户端的环境变量清洗仍然生效。

task 身份用于关联，不是访问控制。当前 Runtime Case 操作接受显式 Case ID，不校验 task 所有权。fork 不会创建执行授权，但复制的历史可能包含 Case 引用；仅在可信单用户环境中使用此配置。多用户 Case 授权、设备执行、KB 登录验证，以及托管更新、修复、回滚和卸载，不属于此开发初始化脚本的能力。已有 home、模型配置、生产 MCP 条目和 systemd 服务均不会被重写。
