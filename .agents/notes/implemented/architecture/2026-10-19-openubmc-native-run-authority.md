# Agent Note: openUBMC native Run authority

Status: implemented

English | [中文](2026-10-19-openubmc-native-run-authority.zh.md)

## Problem

A shared MCP connection cannot infer which DSH Session owns a Runtime Run from model arguments. A missing start response also leaves the Host without a Run id even when Runtime has committed work. Treating continuation as a read can advance device actions from an inspection control.

## Decision

The Host binds Runs only from Turns returned to recorded start calls. Successful native command events restore Session grants; fork prefixes confer neither grants nor Run write access. Session and original call ids determine bounded native operation metadata, preserving identity across a lost acknowledgement and process restart. Runtime owns all Gate, Incident and workflow state; DSH retains returned JSON and validates ownership and response bindings before dispatch.

Read-only `/run` inspects durable observations. Execute continuation remains an explicit execution action. Existing Runs recover through Runtime reconciliation; an unacknowledged start permits one exact replay under its original operation identity. Legacy Case observations remain readable without enabling retired writers.

## Alternatives considered

**Session-derived Case ids.** They describe the retired interface and cannot represent multiple Runtime-issued Runs within a Session.

**Resume as refresh.** Resume can advance a domain effect. Read-only controls therefore use recorded observations and expose their age.

**An additional operator connection.** It adds another authority path and deployment configuration solely for inspection. Recorded Turns retain Gate schemas and recovery details without expanding Agent tool access.

## Consequences

DSH does not duplicate Runtime's state machine or invent rollback after cancellation. A fork starts new Runs rather than adopting its parent's write identity. Historical queries may be stale, and external Runs require an independently designed adoption protocol. Native protocol tests cover restart, foreign Run denial, Gate bindings and start recovery; built profile smokes cover durable command authorization.
