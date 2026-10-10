---
kind: upgrade-guide
description: "Registered headless slash commands execute directly instead of entering the model conversation."
---

# Headless native commands

English | [中文](guide.zh.md)

## Change

`dsh --profile headless "/command arguments"` previously submitted its task text to the model. When the composition registers that command, headless now executes it through the native command registry, records its human invocation and result, and exits without inference. Unknown commands still enter the model conversation. Command success exits 0; command errors exit 1. JSON output carries `session` and `final` without turn events for native commands.

## Migration

1. Review scripts that submit tasks beginning with a registered slash command. To discuss command text with the model, use a prose prompt such as `Explain the /compact command`.
2. To apply a native command to an existing conversation, pass `--session-id <id>` with the same profile and working directory.
3. For JSON consumers, accept a `session` followed directly by `final` and use the process exit code to distinguish command success from error. Confirm the command result appears without a model turn.
