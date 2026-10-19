/** Real upstream Agent gateway through shared stdio and a persistent DSH Session. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import * as mcp from '@deepseek-ai/dsh-mcp-client'
import * as cases from '@deepseek-ai/dsh-experimental-openubmc-cases'
import { expect, it } from 'vitest'
import { bench } from './harness.ts'

const workflow = process.env.DSH_OPENUBMC_WORKFLOW
const meta = z.object({ mcp: z.object({ structuredContent: z.record(z.string(), z.json()) }) })
const fixture = fileURLToPath(new URL('./fixtures/python-runtime.py', import.meta.url))
const wrapper = fileURLToPath(new URL('../../../../scripts/openubmc/runtime_stdio.py', import.meta.url))

it.skipIf(workflow === undefined)('runs native observe/start/Gate/continuation and isolates Runs across process restart and fork', async () => {
  const state = await mkdtemp(join(tmpdir(), 'dsh-agent-protocol-'))
  let events: readonly SessionEvent[] = []
  let runId = ''
  let gate: Record<string, import('@deepseek-ai/dsh-util-values').JsonValue> = {}
  try {
    for (let generation = 0; generation < 2; generation++) {
      const b = await bench(events)
      try {
        await b.ctx.plugin(cases, { serverName: 'runtime' })
        await b.ctx.plugin(mcp, { serverName: 'runtime', transport: 'stdio', command: 'python3',
          args: [wrapper, '--entry', fixture], cwd: workflow!, env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: state },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInMeta: true,
          structuredContentInText: true, failOnStartupError: true, toolCallTimeoutMs: 21000,
          reconnect: { enabled: false, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 } })
        if (generation === 0) {
          const observed = await b.execute('observe', { target: '192.0.2.10', selectors: [{ id: 'cap', kind: 'capability', names: ['ssh'] }] })
          expect(observed.isError, JSON.stringify(observed.content)).toBe(false)
          expect(meta.parse(observed.meta).mcp.structuredContent).toMatchObject({ status: 'complete', coverage: { complete: true }, observation_ref: { target: '192.0.2.10' } })
          await b.command('/target-authorize execute')
          const started = await b.execute('execute', { kind: 'start', intent: 'diagnose-and-fix', target: '192.0.2.10', delivery_strategy: 'source-only' })
          expect(started.isError, JSON.stringify(started.content)).toBe(false)
          const turn = meta.parse(started.meta).mcp.structuredContent
          runId = z.string().parse(turn.run_id)
          gate = z.record(z.string(), z.json()).parse(turn.gate)
          expect(turn).toMatchObject({ state: 'waiting_response', response_required: true, gate: { name: 'diagnosis.acceptance' } })
          expect((await b.command('/run'))?.result).toMatchObject({ kind: 'success', text: expect.stringContaining(runId) })
        } else {
          const resumed = await b.execute('execute', { kind: 'resume', run_id: runId })
          expect(resumed.isError, JSON.stringify(resumed.content)).toBe(false)
          expect(meta.parse(resumed.meta).mcp.structuredContent.run_id).toBe(runId)
          const fork = b.ctx.sessions.fork(b.session, undefined, SessionId('protocol-fork'))
          const forkAgent = { ...b.agent, id: fork.id, session: fork }
          await b.command('/target-authorize execute', forkAgent)
          const denied = await b.execute('execute', { kind: 'resume', run_id: runId }, forkAgent)
          expect(denied.isError).toBe(true)
          expect(denied.meta).toMatchObject({ mcp: { dispatchStatus: 'not-started' } })
          const invalid = await b.execute('execute', { kind: 'respond', run_id: runId, gate_id: gate.gate_id,
            gate_version: gate.gate_version, schema_digest: gate.schema_digest,
            response: { status: 'completed', summary: 'missing evidence', payload: {} } })
          expect(invalid.isError).toBe(true)
          expect(meta.parse(invalid.meta).mcp.structuredContent).toMatchObject({
            error: { code: expect.any(String) }, gaps: expect.any(Array),
          })
          const failed = await b.execute('execute', { kind: 'respond', run_id: runId, gate_id: gate.gate_id,
            gate_version: gate.gate_version, schema_digest: gate.schema_digest,
            response: { status: 'failed', summary: 'offline source work remains', payload: {} } })
          const turn = meta.parse(failed.meta).mcp.structuredContent
          expect(turn.run_id).toBe(runId)
          expect(turn.state).toBe('failed')
          expect(turn.outcome).toMatchObject({ status: 'failed' })
        }
        events = JSON.parse(JSON.stringify(b.session.snapshotEvents())) as SessionEvent[]
      } finally { await b.ctx.fiber.dispose() }
    }
  } finally { await rm(state, { recursive: true, force: true }) }
}, 60_000)

it.skipIf(workflow === undefined)('recovers an unacknowledged native start across both Host and Runtime restart without creating another Run', async () => {
  const state = await mkdtemp(join(tmpdir(), 'dsh-agent-start-recovery-'))
  let events: readonly SessionEvent[] = []
  let originalId = ''
  let runId = ''
  const action = { kind: 'start', intent: 'diagnose-and-fix', target: '192.0.2.10', delivery_strategy: 'source-only' }
  try {
    for (let generation = 0; generation < 2; generation++) {
      const b = await bench(events)
      try {
        await b.ctx.plugin(mcp, { serverName: 'runtime', transport: 'stdio', command: 'python3', args: [wrapper, '--entry', fixture], cwd: workflow!,
          env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: state }, sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'],
          structuredContentInMeta: true, structuredContentInText: true, failOnStartupError: true, toolCallTimeoutMs: 21000 })
        if (generation === 0) await b.command('/target-authorize execute')
        else {
          expect(Object.keys(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.runs)).toHaveLength(0)
          expect((await b.execute('execute', action)).isError).toBe(true)
          await b.command(`/target-reconcile ${originalId}`)
        }
        const started = await b.execute('execute', action)
        expect(started.isError, JSON.stringify(started.content)).toBe(false)
        const id = z.string().parse(meta.parse(started.meta).mcp.structuredContent.run_id)
        if (generation === 0) {
          runId = id
          originalId = started.callId
          const recorded = b.session.snapshotEvents()
          const settled = recorded.findIndex(event => event.type === 'tool/result' && event.data.message.toolCallId === originalId)
          expect(settled).toBeGreaterThan(0)
          // Model a Host crash after dispatch but before the acknowledgement is durable.
          events = JSON.parse(JSON.stringify(recorded.slice(0, settled))) as SessionEvent[]
        } else {
          expect(id).toBe(runId)
          expect(Object.keys(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.runs)).toEqual([runId])
          expect(b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!.pendingCalls).toEqual({})
        }
      } finally { await b.ctx.fiber.dispose() }
    }
  } finally { await rm(state, { recursive: true, force: true }) }
}, 60_000)
