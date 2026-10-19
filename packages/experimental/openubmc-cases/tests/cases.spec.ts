import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { Session, SessionId, SessionLogOffset, SessionSeq, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { describe, expect, it, vi } from 'vitest'
import * as cases from '../src/index.ts'

function result(seq: number, structuredContent: JsonValue, serverName = 'runtime', isError = false, toolName = 'workflow.next'): SessionEvent {
  return {
    type: 'tool/result', seq: SessionSeq(seq), time: 0, surfaceOp: 'append',
    data: {
      turn: 0, step: 0,
      message: createToolResultMessage({ callId: ToolCallId('case-call'), content: [{ type: 'text', text: 'case-FAKE: completed' }], isError }),
      meta: { mcp: { serverName, toolName, structuredContent } },
    },
  }
}

function header(id: string): SessionHeader {
  return Session.create(SessionId(id)).header
}

const envelope = {
  schema: 'openubmc.target-runtime.v1/agent-envelope',
  case_id: 'case-7', revision: 2, status: 'blocked', operation: { name: 'workflow.next', status: 'blocked' },
  evidence_refs: [{ evidence_id: 'ev-1' }], next_actions: ['case_read'],
}

describe('openUBMC Case observations', () => {
  it('keeps Case state separate from completed reads and retains recovery information across status and evidence reads', () => {
    const unit = cases.createCasesProjection('runtime')
    const agentEnvelope = {
      ...envelope,
      operation: { name: 'case_read', status: 'completed' }, status: 'completed',
    }
    const read = {
      ...envelope, schema: 'openubmc.target-runtime.v1/context-runtime', status: 'mutation_outcome_unknown', agent_envelope: agentEnvelope,
    }
    const observed = unit.apply(unit.init(header('s1'), SessionLogOffset(0)), result(0, read, 'runtime', false, 'case_read'))
    expect(observed.view.cases[0]).toMatchObject({ status: 'mutation_outcome_unknown', operationStatus: 'completed', evidenceRefs: envelope.evidence_refs, nextActions: envelope.next_actions })
    for (const toolName of ['runtime_status', 'evidence_read']) {
      const updated = unit.apply(observed, result(1, {
        ...agentEnvelope, operation: { name: toolName, status: 'completed' }, evidence_refs: [], next_actions: [],
      }, 'runtime', false, toolName))
      expect(updated.view.cases[0]).toMatchObject({ status: 'mutation_outcome_unknown', operationStatus: 'completed', evidenceRefs: envelope.evidence_refs, nextActions: envelope.next_actions })
    }
  })

  it('ignores unrelated structured data from the configured server', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    expect(unit.apply(initial, result(0, { case_id: 'case-unrelated', status: 'completed', schema: 'unrelated/v1' }))).toBe(initial)
  })

  it('derives both failed and successful observations from protocol data, ignoring tool prose and other servers', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    expect(unit.apply(initial, result(0, envelope, 'other'))).toBe(initial)
    const failed = unit.apply(initial, result(0, envelope, 'runtime', true))
    expect(failed.view.cases).toEqual([{
      caseId: 'case-7', revision: 2, status: null, operationStatus: 'blocked', toolName: 'workflow.next', isError: true,
      inherited: false, observedAtSeq: 0, evidenceRefs: [{ evidence_id: 'ev-1' }], nextActions: ['case_read'],
    }])
    const completed = unit.apply(failed, result(1, { agent_envelope: {
      ...envelope, revision: 3, status: 'completed', operation: { name: 'workflow.next', status: 'completed' },
      capsule: { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: 'case-7', case_revision: 3, status: 'open', next_actions: ['workflow.advance'] },
    }, status: 'wrong' }))
    expect(completed.view.cases).toHaveLength(1)
    expect(completed.view.cases[0]).toMatchObject({ revision: 3, status: 'open', operationStatus: 'completed', isError: false, nextActions: ['workflow.advance'] })
  })

  it('keeps malformed Case data visible without manufacturing a valid Case', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    expect(unit.apply(initial, result(0, { status: 'completed' }))).toBe(initial)
    const invalid = unit.apply(initial, result(0, { ...envelope, revision: -1 }))
    expect(invalid.view.cases).toEqual([])
    expect(invalid.view.failure).toContain('Invalid openUBMC Case metadata')
    expect(unit.apply(invalid, result(1, envelope)).view.failure).toBeNull()
  })

  it('rejects inconsistent identities, revisions and incomplete domain records while keeping the last valid observation', () => {
    const unit = cases.createCasesProjection('runtime')
    const valid = unit.apply(unit.init(header('s1'), SessionLogOffset(0)), result(0, envelope))
    const capsule = { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: 'case-7', case_revision: 2, status: 'open', next_actions: [] }
    for (const structured of [
      { ...envelope, next_actions: undefined },
      { ...envelope, operation: { name: 'workflow.next', status: 'completed' } },
      { ...envelope, operation: { name: 'unrelated', status: 'blocked' } },
      { ...envelope, capsule: { ...capsule, status: 7 } },
      { ...envelope, capsule: { ...capsule, case_id: 'case-other' } },
      { ...envelope, capsule: { ...capsule, case_revision: 3 } },
    ]) {
      const wire = JSON.parse(JSON.stringify(structured)) as JsonValue
      const invalid = unit.apply(valid, result(1, wire))
      expect(invalid.view.failure).toContain('Invalid openUBMC Case metadata')
      expect(invalid.view.cases).toEqual(valid.view.cases)
    }
  })

  it('ignores events without supported domain metadata and exposes a validated client view', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    const event = result(0, envelope)
    if (event.type !== 'tool/result') throw new Error('fixture must be a tool result')
    expect(unit.apply(initial, { ...event, data: { ...event.data, meta: { mcp: { serverName: 'runtime', toolName: 'workflow.next' } } } })).toBe(initial)
    expect(unit.apply(initial, result(0, { ...envelope, case_id: '' }))).toBe(initial)
    for (const agent_envelope of [null, [], 'invalid']) expect(unit.apply(initial, result(0, { agent_envelope }))).toBe(initial)
    const view = unit.wire.view(initial)
    expect(unit.wire.viewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual({ cases: [], failure: null, inheritedEventCount: 0 })
  })

  it('reports unknown Case state for operation-only results and replaces Case fields only when reported', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    const status = { ...envelope, operation: { name: 'runtime_status', status: 'completed' }, status: 'completed', evidence_refs: [], next_actions: [] }
    const observed = unit.apply(initial, result(0, status, 'runtime', false, 'runtime_status'))
    expect(observed.view.cases[0]).toMatchObject({ status: null, operationStatus: 'completed', evidenceRefs: [], nextActions: [] })
    const failedRead = unit.apply(observed, result(1, { ...status, operation: { name: 'evidence_read', status: 'failed' }, status: 'failed', next_actions: ['check_evidence'] }, 'runtime', true, 'evidence_read'))
    expect(failedRead.view.cases[0]).toMatchObject({ status: null, operationStatus: 'failed', nextActions: ['check_evidence'] })
    const emptyCase = unit.apply(failedRead, result(2, {
      ...status, schema: 'openubmc.target-runtime.v1/context-runtime', revision: 2, status: 'open', agent_envelope: { ...status, operation: { name: 'case_read', status: 'completed' } },
    }, 'runtime', false, 'case_read'))
    expect(emptyCase.view.cases[0]).toMatchObject({ status: 'open', operationStatus: 'completed', evidenceRefs: [], nextActions: [] })
  })

  it('rebuilds observations from JSON and marks only the fork-inherited prefix', () => {
    const unit = cases.createCasesProjection('runtime')
    const events = JSON.parse(JSON.stringify([result(0, envelope, 'runtime', true), result(1, { ...envelope, case_id: 'case-8' })])) as SessionEvent[]
    const resumed = events.reduce(unit.apply, unit.init(header('resume'), SessionLogOffset(0)))
    expect(resumed.view.cases.map(c => c.inherited)).toEqual([false, false])
    const forked = events.reduce(unit.apply, unit.init(header('fork'), SessionLogOffset(1)))
    expect(forked.view.cases.map(c => c.inherited)).toEqual([true, false])
    expect(unit.stateSchema.parse(JSON.parse(JSON.stringify(forked)))).toEqual(forked)
  })

  it('queries the native command without calling Runtime and removes contributions on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Sessions)
      await ctx.plugin(Projections)
      await ctx.plugin(Commands)
      await ctx.plugin(AgentRegistry)
      const session = ctx.sessions.create(SessionId('command-cases'))
      const agent: Agent = {
        id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
        send() {}, followup() {}, steer() {}, inject() {}, cancel() {},
        runMaintenance: task => task(new AbortController().signal), whenIdle: async () => {},
      }
      await ctx.agents.register(agent)
      const fiber = await ctx.plugin(cases, { serverName: 'runtime' })
      const run = (line = '/case') => ctx.commands.execute(agent, line, [], new AbortController().signal)
      expect((await run())?.result).toMatchObject({ kind: 'success', text: 'No openUBMC Case has been observed in this session.' })
      const observation = result(0, envelope, 'runtime', true)
      if (observation.type !== 'tool/result') throw new Error('fixture must be a tool result')
      session.append('tool/result', observation.data, { surfaceOp: 'append' })
      expect((await run())?.result.text).toContain('case-7 | Case status unreported | revision 2 | operation blocked | failed')
      expect((await run('/case mutate'))?.result.kind).toBe('error')
      const inheritedSession = ctx.sessions.fork(session, undefined, SessionId('inherited-cases'))
      const inheritedAgent = { ...agent, id: inheritedSession.id, session: inheritedSession }
      expect((await ctx.commands.execute(inheritedAgent, '/case case-7', [], new AbortController().signal))?.result.text).toContain('inherited observation')
      const read = result(inheritedSession.seq, { ...envelope, status: 'completed',
        operation: { name: 'evidence_read', status: 'completed' }, evidence_refs: [], next_actions: [],
      }, 'runtime', false, 'evidence_read')
      if (read.type !== 'tool/result') throw new Error('fixture must be a tool result')
      inheritedSession.append('tool/result', read.data, { surfaceOp: 'append' })
      expect((await ctx.commands.execute(inheritedAgent, '/case case-7', [], new AbortController().signal))?.result.text).toContain('inherited observation')
      expect(ctx.sessionProjections.stateOf(inheritedSession, 'openubmc/cases')?.view.cases[0]).toMatchObject({
        inherited: true, operationStatus: 'completed', nextActions: ['case_read'], evidenceRefs: envelope.evidence_refs,
      })
      const caseRead = result(inheritedSession.seq, { ...envelope, schema: 'openubmc.target-runtime.v1/context-runtime', status: 'open',
        agent_envelope: { ...envelope, operation: { name: 'case_read', status: 'completed' }, status: 'completed' },
      }, 'runtime', false, 'case_read')
      if (caseRead.type !== 'tool/result') throw new Error('fixture must be a tool result')
      inheritedSession.append('tool/result', caseRead.data, { surfaceOp: 'append' })
      expect((await ctx.commands.execute(inheritedAgent, '/case case-7', [], new AbortController().signal))?.result.text).toContain('session observation')
      const empty = result(1, { ...envelope, case_id: 'case-8', evidence_refs: [], next_actions: [],
        capsule: { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: 'case-8', case_revision: 2, status: 'open', next_actions: [] },
      })
      if (empty.type !== 'tool/result') throw new Error('fixture must be a tool result')
      session.append('tool/result', empty.data, { surfaceOp: 'append' })
      expect((await run('/case case-8'))?.result.text).toContain('succeeded')
      expect((await run('/case case-8'))?.result.text).toContain('none reported')
      const invalid = result(2, { ...envelope, revision: -1 })
      if (invalid.type !== 'tool/result') throw new Error('fixture must be a tool result')
      session.append('tool/result', invalid.data, { surfaceOp: 'append' })
      expect((await run())?.result.kind).toBe('error')
      expect((await run())?.result.text).toContain('Invalid openUBMC Case metadata')
      const absent = vi.spyOn(ctx.sessionProjections, 'stateOf').mockReturnValueOnce(undefined)
      try {
        await expect(run()).rejects.toThrow('projection is not registered')
      } finally {
        absent.mockRestore()
      }
      await fiber.dispose()
      expect(await run()).toBeUndefined()
      expect(ctx.sessionProjections.stateOf(session, 'openubmc/cases')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

it('retains phase and artifact observations across sparse results and replaces explicit empty arrays', () => {
  const unit = cases.createCasesProjection('runtime')
  const initial = unit.init(header('phase-owner'), SessionLogOffset(0))
  const agent = { ...envelope, status: 'completed', operation: { name: 'case_read', status: 'completed' } }
  const report = { schema: 'openubmc.target-runtime.v1/context-runtime', case_id: 'case-7', revision: 2, status: 'active', evidence_refs: [], next_actions: [], phase_records: [{ phase_type: 'build.artifact' }], artifact_revisions: [{ artifact_sha256: 'fingerprint' }], agent_envelope: agent }
  const recorded = unit.apply(initial, result(0, report, 'runtime', false, 'case_read'))
  expect(recorded.view.cases[0]).toMatchObject({ phaseRecords: report.phase_records, artifactRevisions: report.artifact_revisions })
  const sparse = unit.apply(recorded, result(1, envelope))
  expect(sparse.view.cases[0]).toMatchObject({ phaseRecords: report.phase_records, artifactRevisions: report.artifact_revisions })
  const empty = unit.apply(sparse, result(2, { ...report, phase_records: [], artifact_revisions: [] }, 'runtime', false, 'case_read'))
  expect(empty.view.cases[0]).toMatchObject({ phaseRecords: [], artifactRevisions: [] })
})

it('retains native Gate/Incident and receipt JSON beside historical Cases, with fork observations and no device query', () => {
  const unit = cases.createCasesProjection('runtime')
  const initial = unit.init(header('agent-view'), SessionLogOffset(2))
  const turn = { schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-1', state: 'incident',
    gate: { gate_id: 'gate-1', gate_version: 2, schema_digest: 'sha256:abc', input_schema: {} },
    incident: { incident_id: 'incident-1', allowed_commands: ['reconcile'], operator_action: 'inspect journal' }, outcome: null, facts: [], gaps: ['effect unknown'] }
  const observed = unit.apply(initial, result(1, turn, 'runtime', true, 'execute'))
  expect(observed.view.agentResults).toEqual([{ id: 'run-1', kind: 'run', document: turn, isError: true, inherited: true, observedAtSeq: 1 }])
  const receipt = { schema: 'openubmc.target-runtime.v1/agent-gateway-v1/observation-receipt', receipt_id: 'receipt-1', status: 'incomplete', coverage: { not_checked: 1 }, gaps: ['transport unavailable'] }
  const both = unit.apply(observed, result(2, receipt, 'runtime', false, 'observe'))
  expect(both.view.agentResults).toHaveLength(2)
  const withHistory = unit.apply(both, result(3, envelope))
  expect(withHistory.view.agentResults).toEqual(both.view.agentResults)
  expect(unit.apply(withHistory, result(4, { ...turn, state: 'running' }, 'foreign', false, 'execute'))).toBe(withHistory)
  expect(unit.wire.viewSchema.parse(unit.wire.view(withHistory)).agentResults).toHaveLength(2)
})
