---
description: "Read observed openUBMC Case information from durable tool metadata."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-openubmc-cases

English | [中文](README.zh.md)

## Summary

This optional plugin projects observed openUBMC Cases from Session tool results and registers the read-only `/case [case-id]` command. Runtime remains authoritative; the view shows the last observed result, including failures, and marks fork-inherited observations. The plugin makes no Runtime calls and grants no execution authorization.

## Table of Contents

- [Configuration and use](#configuration-and-use)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration-and-use"></a>
## Configuration and use

`serverName` selects an exact MCP namespace in durable metadata; historical queries require no live MCP connection. To capture new observations, enable that client's `structuredContentInMeta`. The [development profile](../../../scripts/openubmc/README.md) composes both settings. `/case` lists observed Cases; `/case case-7` selects one. Unknown IDs return an error. Commands do not send a model request or query the device.

The `openubmc/cases` Session projection exposes the latest observation per Case: revision, Case status when reported, operation status, original tool name, failure flag, evidence references, next actions, event sequence and inherited flag. Its JSON types are exported through `./types`. The projection rebuilds from existing `tool/result` metadata on restart; its checkpoint is only a derived cache. Only the v1 agent-envelope schema is admitted. Operation status comes from `agent_envelope` when present; Case status comes from the context-runtime Case projection or capsule and remains unknown until reported. Successful status and evidence reads preserve known Case state and recovery information. Full Case reads replace the reported Case fields; other operations retain evidence references when none are reported. Malformed Case fields leave a visible diagnostic and retain the last valid observations; a later valid observation clears the diagnostic. Results without a Case ID and results from other servers do not change the view. Inherited Case information remains marked until a current-session full Case report replaces it.

Register this plugin once per composition. Disposing it removes the command and projection registration. No invariant companion is published: its only state is a pure projection of the Session log, with no independently maintained Case store that could diverge.

Full Case reads retain Runtime phase records and artifact revisions, including revisions supplied by the agent envelope capsule. `/case` includes these observations alongside evidence and next actions. Native inspections use the same projection fold as tool results.

<a id="model-experience"></a>
## Model Experience

None, as this plugin exposes a user command and a Session projection without adding model tools or context.

#### KV Cache effect

No direct change to model requests or reusable prefixes; the MCP client owns model-visible tool content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Observation freshness** — `/case` does not refresh Runtime state. Other sessions or external actions may change a Case after its last recorded observation.
- **Execution authority** — inherited observations are labels, not an ownership check. Runtime calls still need task ownership and fork authorization enforcement before device execution can be qualified.
- **Result coverage** — top-level `tool/result` and native inspection metadata are observed. PTC sub-dispatches are not included.
- **Presentation** — live read controls require the optional Web Case plugin and Runtime adapter.

<a id="dev-note"></a>
### Dev Note

None.
