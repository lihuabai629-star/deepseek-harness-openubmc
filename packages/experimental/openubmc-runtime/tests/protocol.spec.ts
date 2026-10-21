/** Real upstream Agent gateway through shared stdio and a persistent DSH Session. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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
          expect((await b.command('/run'))?.result.text).toContain(runId)
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
          expect(z.object({ error: z.object({ code: z.string().min(1) }), gaps: z.array(z.json()) })
            .safeParse(meta.parse(invalid.meta).mcp.structuredContent).success).toBe(true)
          const failed = await b.command(`/target-action ${JSON.stringify({ kind: 'respond', run_id: runId, gate_id: gate.gate_id,
            gate_version: gate.gate_version, schema_digest: gate.schema_digest,
            response: { status: 'failed', summary: 'offline source work remains', payload: {} } })}`)
          expect(failed?.result.kind).toBe('success')
          const inspection = b.session.snapshotEvents().findLast(event => event.type === 'openubmc/inspection')!
          if (inspection.type !== 'openubmc/inspection') throw new Error('Native response missing')
          const turn = meta.parse(inspection.data.meta).mcp.structuredContent
          expect(turn.run_id).toBe(runId)
          expect(turn.state).toBe('failed')
          expect(turn.outcome).toMatchObject({ status: 'failed' })
        }
        events = JSON.parse(JSON.stringify(b.session.snapshotEvents())) as SessionEvent[]
      } finally { await b.ctx.fiber.dispose() }
    }
  } finally { await rm(state, { recursive: true, force: true }) }
}, 60_000)

it.skipIf(workflow === undefined).each(['retry', 'retry-removed'])('refreshes repeated native reconciliation across restarts without dispatching the Effect again (%s)', async (scenario) => {
  const state = await mkdtemp(join(tmpdir(), 'dsh-agent-reconcile-retry-'))
  let events: readonly SessionEvent[] = []
  let runId = ''
  const artifact = join(state, 'patch.lua')
  const body = 'return "offline recovery fixture"\n'
  try {
    await writeFile(artifact, body)
    for (let generation = 0; generation < 3; generation++) {
      const b = await bench(events)
      try {
        await b.ctx.plugin(mcp, { serverName: 'runtime', transport: 'stdio', command: 'python3',
          args: [wrapper, '--entry', fixture], cwd: workflow!,
          env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: state, DSH_RECOVERY_SCENARIO: scenario },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'],
          structuredContentInMeta: true, structuredContentInText: true, failOnStartupError: true, toolCallTimeoutMs: 21000 })
        if (generation === 0) {
          await b.command('/target-authorize execute')
          const started = await b.execute('execute', { kind: 'start', intent: scenario === 'retry' ? 'live-patch' : 'rollback', target: '192.0.2.10',
            entry_operation: 'live_patch_run', entry_arguments: { ...(scenario === 'retry' ? { local_path: artifact,
              artifact_sha256: createHash('sha256').update(body).digest('hex'), remote_path: '/tmp/fixture.lua',
            } : { action: 'rollback', remove_created: true, expected_current_sha256: 'a'.repeat(64), remote_path: '/tmp/fixture.lua' }),
            mode: '600', restart_scope: 'none', mdb_only: true } })
          expect(started.isError, JSON.stringify(started.content)).toBe(false)
          const turn = meta.parse(started.meta).mcp.structuredContent
          runId = z.string().parse(turn.run_id)
          expect(turn).toMatchObject({ state: 'incident', incident: { code: 'mutation_outcome_unknown' } })
        } else {
          const recovered = await b.command(`/target-action ${JSON.stringify({ kind: 'control', run_id: runId, command: 'reconcile' })}`)
          expect(recovered?.result.kind).toBe('success')
          const inspection = b.session.snapshotEvents().findLast(event => event.type === 'openubmc/inspection')
          if (inspection?.type !== 'openubmc/inspection') throw new Error('Native recovery result missing')
          const turn = meta.parse(inspection.data.meta).mcp.structuredContent
          expect(turn.run_id).toBe(runId)
          expect(turn.state).toBe(generation === 1 ? 'incident' : 'completed')
        }
        events = structuredClone(b.session.snapshotEvents())
      } finally { await b.ctx.fiber.dispose() }
      const records = (await readFile(join(state, 'effects.jsonl'), 'utf8')).trim().split('\n')
        .map(line => z.object({ kind: z.enum(['dispatch', 'recover']), effect_id: z.string() }).parse(JSON.parse(line)))
      expect(records.map(record => record.kind)).toEqual(['dispatch', ...Array<string>(generation + 1).fill('recover')])
      expect(new Set(records.map(record => record.effect_id)).size).toBe(1)
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
