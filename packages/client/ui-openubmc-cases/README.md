---
description: "Optional native Web presentation of durable openUBMC Runs, observation receipts and historical Cases."
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

Configure `serverName` with the same trusted MCP namespace as the Host [Case projection](../../experimental/openubmc-cases/README.md). The [openUBMC Web profile](../../../scripts/openubmc/README.md) composes this plugin with `--case-ui`; its Host projection and Runtime authority also work without cards. The default Web profile does not load it.

Native Run cards retain Gate ids, versions and response schemas; Incident recovery details; Outcome, facts, gaps and progress. Observation receipt cards expose coverage, freshness, results and evidence. Complete JSON remains expandable. Historical Case cards retain their recorded fields without live read controls.

Every card shows a recorded observation. A later result marks the earlier card as possibly stale; fork-inherited cards retain their historical label. Only the latest current-session Run card offers explicit authorization, continuation, cancellation and reconciliation through native Host commands. Continuation controls follow the Host's permission for that Run; read-only diagnosis does not need a general execution grant. Session authorization and revocation remain separate controls. Gate forms retain the returned identity and submission binding, collect explicit response fields and leave complete schema validation to Runtime. Failed submissions retain the draft. Rendering, expanding or reloading a card never invokes execution. Failed results remain failed; invalid or foreign-source metadata uses generic tool presentation.

## Dev Note

The Client owns a Conversation definition, keyed renderers and locale dictionaries. The Host face publishes configuration only. No invariant companion is published: all presentation comes from the Session log and the existing Host projection, without an independent Case state store.

## Model Experience

None, as explicit controls invoke native Host commands without a model request.

#### KV Cache effect

This plugin does not change model requests or reusable prefixes.

## Known Limitations and Deferred Work

- Cards render Runtime-provided phase, evidence and artifact JSON. They do not open host artifact paths or provide Run creation. A stale label does not perform background polling. Recorded cards remain readable offline.
