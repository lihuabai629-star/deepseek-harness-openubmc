---
description: "GitHub issue tracker"
kind: "reference"
---

# GitHub issue tracker

English | [中文](issue-tracker.zh.md)

Issues and specifications live in `lihuabai629-star/deepseek-harness-openubmc`. Use `gh` with an explicit `--repo lihuabai629-star/deepseek-harness-openubmc`; the official upstream is not the default destination for integration work.

Create issues with `gh issue create`; read with `gh issue view`; list with `gh issue list`; update with `gh issue edit`. Pass multiline descriptions through `--body-file`. When a skill requests publication to the issue tracker, create an issue here; when it requests a ticket, read the referenced issue.

PRs as a request surface: no.

Use the [triage mapping](triage-labels.md). Link dependent issues in their bodies and use GitHub sub-issues when available. A wayfinding effort has one map issue and one child issue per question or task; record blockers, claims, answers and resolution on those issues.
