---
description: "GitHub 问题跟踪"
kind: "reference"
---

# GitHub 问题跟踪

[English](issue-tracker.md) | 中文

Issue 和规格保存在 `lihuabai629-star/deepseek-harness-openubmc`。使用 `gh` 时显式指定 `--repo lihuabai629-star/deepseek-harness-openubmc`；适配开发默认不向官方上游提交任务。

使用 `gh issue create` 创建、`gh issue view` 读取、`gh issue list` 列举、`gh issue edit` 更新 Issue。多行描述通过 `--body-file` 传入。技能要求发布到问题跟踪器时，在此创建 Issue；要求获取任务时，读取引用的 Issue。

PRs as a request surface: no.

使用[分流状态映射](triage-labels.zh.md)。在正文中关联依赖 Issue，可用时使用 GitHub 子 Issue。每项探索工作由一个总览 Issue 和每个问题或任务对应的子 Issue 组成；在这些 Issue 中记录阻塞、认领、答案和解决状态。
