---
kind: upgrade-guide
description: "已注册的 headless 斜杠命令直接执行，不再进入模型会话。"
---

# Headless 原生命令

[English](guide.md) | 中文

## 变更

`dsh --profile headless "/command arguments"` 以前把任务文本提交给模型。现在，如果组合中注册了该命令，headless 会通过原生命令注册表执行，记录用户调用和结果，然后退出，不调用模型。未知命令仍进入模型会话。命令成功退出 0，命令错误退出 1。原生命令的 JSON 输出包含 `session` 和 `final`，不包含 turn 事件。

## 迁移

1. 检查提交任务的脚本是否以已注册的斜杠命令开头。若需与模型讨论命令文本，使用普通说明提示词，例如 `Explain the /compact command`。
2. 在已有会话执行原生命令时，传入 `--session-id <id>`，并使用相同的 profile 和工作目录。
3. JSON 消费方应接受 `session` 后直接出现 `final`，并通过进程退出码区分命令成功与错误。确认命令结果出现且没有模型 turn。
