---
description: "Optional native Web presentation of durable openUBMC Case observations and bounded evidence reads."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-openubmc-cases

English | [中文](README.zh.md)

## Summary

This optional Client plugin renders persisted Runtime results as Case cards in the conversation. Case status, operation outcome and transport failure remain distinct. Cards show phase records, evidence references, artifact fingerprints and next actions from validated metadata.

## Table of Contents

- [Configuration and inspection](#configuration-and-inspection)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration and inspection

Configure `serverName` with the same trusted MCP namespace as the Host [Case projection](../../experimental/openubmc-cases/README.md). The [openUBMC Web profile](../../../scripts/openubmc/README.md) composes the Host projection, Runtime authority and this plugin. The default Web profile does not load it.

Refresh Case and evidence buttons invoke the Session's native `/case-refresh` and `/evidence` commands through the command Remote. They require the [Runtime adapter](../../experimental/openubmc-runtime/README.md); they do not ask a model or grant target execution. The adapter owns evidence read limits and Case isolation. Native inspection results enter durable conversation history, so reloading the page reconstructs the cards.

Every card is a historical observation. An observation is marked as possibly stale unless it is the latest full Case read. Fork-inherited cards keep their historical label and disable live controls; reading the fork's new Case produces a separate current observation. Operation errors stay visibly failed even when a subsequent Case query succeeds. Invalid or foreign-source metadata uses the generic tool presentation.

## Dev Note

The Client owns a Conversation definition, one keyed renderer, locale dictionaries and native command callbacks. The Host face publishes configuration only. No invariant companion is published: all presentation comes from the Session log and the existing Host projection, without an independent Case state store.

## Model Experience

None, as this plugin presents persisted Case metadata and invokes non-model inspection commands.

#### KV Cache effect

This plugin does not change model requests or reusable prefixes.

## Known Limitations and Deferred Work

- Cards render Runtime-provided phase, evidence and artifact JSON. They do not open host artifact paths or implement device controls. A stale label does not perform background polling. Case queries require a reachable Runtime, while historical cards remain readable offline.
