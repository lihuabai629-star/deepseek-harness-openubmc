import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import Commands from '@deepseek-ai/dsh-commands'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { Session, SessionId, SessionLogOffset, SessionSeq, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { describe, expect, it } from 'vitest'
import * as cases from '../src/index.ts'

function result(seq: number, structuredContent: JsonValue, serverName = 'runtime', isError = false): SessionEvent {
  return {
    type: 'tool/result', seq: SessionSeq(seq), time: 0, surfaceOp: 'append',
    data: {
      turn: 0, step: 0,
      message: createToolResultMessage({ callId: ToolCallId('case-call'), content: [{ type: 'text', text: 'case-FAKE: completed' }], isError }),
      meta: { mcp: { serverName, toolName: 'workflow.next', structuredContent } },
    },
  }
}

function header(id: string): SessionHeader {
  return Session.create(SessionId(id)).header
}

const envelope = { case_id: 'case-7', revision: 2, status: 'blocked', evidence_refs: [{ evidence_id: 'ev-1' }], next_actions: ['case_read'] }

describe('openUBMC Case observations', () => {
  it('derives both failed and successful observations from protocol data, ignoring tool prose and other servers', () => {
    const unit = cases.createCasesProjection('runtime')
    const initial = unit.init(header('s1'), SessionLogOffset(0))
    expect(unit.apply(initial, result(0, envelope, 'other'))).toBe(initial)
    const failed = unit.apply(initial, result(0, envelope, 'runtime', true))
    expect(failed.view.cases).toEqual([{
      caseId: 'case-7', revision: 2, status: 'blocked', toolName: 'workflow.next', isError: true,
      inherited: false, observedAtSeq: 0, evidenceRefs: [{ evidence_id: 'ev-1' }], nextActions: ['case_read'],
    }])
    const completed = unit.apply(failed, result(1, { agent_envelope: { ...envelope, revision: 3, status: 'completed' }, status: 'wrong' }))
    expect(completed.view.cases).toHaveLength(1)
    expect(completed.view.cases[0]).toMatchObject({ revision: 3, status: 'completed', isError: false })
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
      expect((await run())?.result.text).toContain('case-7 | blocked | revision 2 | failed')
      expect((await run('/case mutate'))?.result.kind).toBe('error')
      await fiber.dispose()
      expect(await run()).toBeUndefined()
      expect(ctx.sessionProjections.stateOf(session, 'openubmc/cases')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
