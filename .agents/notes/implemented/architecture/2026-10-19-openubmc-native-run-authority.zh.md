# Agent Note: openUBMC 原生 Run 授权

Status: implemented

[English](2026-10-19-openubmc-native-run-authority.md) | 中文

## 问题

共享 MCP 连接无法从模型参数判断 Runtime Run 属于哪个 DSH Session。启动回包丢失时，即使 Runtime 已提交工作，宿主也可能尚未得到 Run 标识。将续接当作读取会让查看控件推进设备动作。

## 决策

宿主只根据已记录 start 调用返回的 Turn 绑定 Run。成功的原生命令事件恢复广泛授权或目标、intent、delivery 范围授权。原生提问批准通过 `openubmc/authorization` 记录原启动参数，只允许该次启动及其返回的 Run。没有自定义 operation 或 delivery 的默认 diagnosis-only 启动保持只读。Fork 前缀不提供授权或 Run 写权限。Session 与原工具调用标识决定有界的原生操作元数据，在回包丢失和进程重启后保留身份。

Gate、Incident 和工作流状态由 Runtime 管理；DSH 保存返回的 JSON，并在发送前验证归属、原始范围和响应绑定。模型指引要求 Agent 加载阶段 Skill、完成真实工作并向 Runtime 提交证据。已记录的固定字段上下文报告授权及调用、Run、Gate、Incident 数量，不复制证据。原生 Goal 工具管理用户明确要求的持续工作；打开 Session 不会重新激活执行。

只读 `/run` 查看持久化观察。Execute 续接仍是显式执行动作。已有 Run 通过 Runtime 核对恢复；启动结果未确认时，只允许沿用原操作标识按原输入重放一次。历史 Case 观察仍可读取，不启用已退役的写接口。

原生 `/target-action` 通过已有工具执行器续接当前 Session 拥有的 Run，并将结果记录为 `openubmc/inspection`。同一 Session 投影跟踪未完成的模型调用和原生命令。Web profile 默认使用原生对话；诊断卡片需显式安装。其控件从该投影派生可用性，保留 Runtime Gate 绑定并要求显式提交，不在渲染或重新加载时推进。当前仍在执行的调用结算前，不允许核对。

## 考虑过的替代方案

**从 Session 派生 Case 标识。** 这种方式属于旧接口，无法表达同一 Session 中多个 Runtime 分配的 Run。

**将 resume 当作刷新。** Resume 可能推进领域动作，因此只读控件查看已记录的观察并标明其时效。

**增加 operator 连接。** 仅为查看而增加另一条授权路径和部署配置。已记录的 Turn 能保留 Gate schema 和恢复详情，无需扩大 Agent 工具访问范围。

## 影响

DSH 不复制 Runtime 状态机，也不在取消后推断回退。Fork 启动新的 Run，不接管父会话的写身份。历史查询可能过期，接管外部 Run 需要独立设计的协议。原生协议测试覆盖重启、其他 Run 访问拒绝、Gate 绑定和启动恢复；构建后 profile 验证覆盖持久化命令授权。原生 Loader 组合测试覆盖 Skill 加载、单次原输入启动授权及重启后如实提交失败证据；Session 快照固定模型指引和已记录上下文。
