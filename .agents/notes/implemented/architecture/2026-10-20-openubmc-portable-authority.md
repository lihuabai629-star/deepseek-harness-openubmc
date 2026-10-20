# Agent Note: Portable openUBMC Session authority

Status: implemented

English | [中文](2026-10-20-openubmc-portable-authority.zh.md)

## Problem

An installable openUBMC bundle cannot require patched MCP dispatch or custom required event types in an official DSH Host. Discarding authorization during replay or losing the operation identity after disconnect could admit an unauthorized continuation or repeat a device effect.

## Decision

The portable provider uses public tool, command, prompt, question and projection APIs. It shares `createRuntimeController` with the [native integration](2026-10-19-openubmc-native-run-authority.md), retaining one implementation of Run ownership, grants, Gate binding and uncertain-call recovery. Runtime alone owns domain transitions and device journals.

A private, versioned record binds one trusted Session to grants, returned Runs and unsettled calls. Its filename hashes the Session id; its validated contents retain that id. Writes use exclusive random temporary files, owner-only permissions, file sync, atomic rename and directory sync. A cross-process writer lock serializes updates; a separate execution lease prevents overlapping calls and recovery while permitting revocation. Only writers on the same host and PID namespace are supported. A fork uses a separate record, without inherited authority. The Host projection detects prior execution when the private record is missing; absence or corruption then fails closed.

The plugin-owned MCP provider supplies Session and operation metadata immediately before dispatch. Standard tool results preserve complete failure JSON and native error status through the public around-dispatch API. No custom openUBMC events are appended to the Host log. Prompt context remains recorded by the Host. Disconnected transports reconnect on an explicit call; effects are never automatically replayed. An unacknowledged start retains its original operation identity for human-authorized exact recovery.

## Alternatives considered

**Require a patched Host.** It prevents installation on qualified official releases and couples plugin delivery to Host releases. Native development profiles retain that integration separately.

**Mark authorization events ignorable or modify the Host event catalog.** Missing event producers would silently discard authority, while dynamic registration would make Session readability composition-dependent. Private authority stays mandatory for dispatch and is backed up with Runtime state and Sessions.

**Rebuild execution permission from model arguments or fork history.** Neither is a trusted grant. Missing private state never authorizes adoption or a new effect after prior execution.

## Consequences

Official Host releases are qualified individually through installed archive tests; optional peers list only qualified complete versions. Lifecycle smokes cover tool discovery, structured failures, remount, update, restoration and retained private data. Protocol tests cover exact grants, foreign and fork isolation, cancellation, Gate binding and recovery. These checks use offline peers and do not qualify device transport or firmware. Older custom-event Sessions remain with their compatible Host; the portable plugin starts fresh Sessions rather than converting authority across readers.
