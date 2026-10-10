---
description: "Bind openUBMC Runtime execution to a DSH Session and its human grants."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-runtime

English | [中文](README.zh.md)

## Summary

This optional Host plugin checks Case ownership immediately before MCP dispatch. It uses the Runtime's deterministic default Case ID for the calling Session, injects that ID when omitted, and rejects another ID. Runtime retains Case, workflow, evidence and device state.

## Table of Contents

- [Configuration and authority](#configuration-and-authority)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration-and-authority"></a>
## Configuration and authority

`serverName` selects the protected MCP namespace. Its client must set `sessionIdMetadataKey: taskId` and `requiredToolCallPolicies: [openubmc-session-authority]`; a missing Agent or another metadata key fails before dispatch. Unknown Runtime operations fail closed. The [development profile](../../../scripts/openubmc/README.md) composes this plugin with the MCP client and [Case observations](../openubmc-cases/README.md). The [Session integration reference](../../../docs/subsystems/openubmc-cases.md) owns exported state types.

Device and workflow operations require a native human command such as `/target-authorize debug_run,workflow.advance,workflow.next`. A successful command replaces the Session's allowed operations; `/target-authorize revoke` removes them. This command grants no Runtime authorization exception, selects no target and performs no device action. Issue it only after choosing the intended Case targets and operation scope. Runtime's own authorization and evidence requirements still apply.

The `openubmc/runtime` host projection derives grants from successful `command/run` and `command/done` records outside the fork-inherited prefix. Resume restores those grants; a fork starts with none. Read and phase-record operations still verify Case ownership. Historical Case observations do not grant live access. Each Session has one deterministic Case identity; adopting an older or external Case is unsupported.

The MCP executor checks the required policy validator before its provider callback, so disposal or reload of this plugin refuses protected calls. Registration effects remove the command, dispatch listener and projection on disposal. No invariant companion is published: grants derive from one Session projection, without another independently maintained authority store.

<a id="model-experience"></a>
## Model Experience

### Runtime execution results

#### What the model sees

The existing MCP tools return an error when Case ownership or human authority is missing, such as `The requested Case does not belong to this Session.` The plugin adds no tool schema or prompt section. Successful Runtime results remain owned by the MCP client.

#### Token effect

A denied call contributes its error text through the existing tool result; native commands add no model messages.

#### KV Cache effect

Tool results append to history without rewriting the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Host scope** — this adapter protects the configured DSH MCP bridge. Direct access to Python Runtime requires its own authentication and ownership policy.
- **Case adoption** — live operations use one Session-derived Case; external and legacy Cases remain historical observations.
- **Authority scope** — grants select operations within a Session. They do not authorize credential exceptions or substitute for a concrete device change plan.

<a id="dev-note"></a>
### Dev Note

None.
