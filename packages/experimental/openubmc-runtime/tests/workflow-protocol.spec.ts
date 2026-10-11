/** Real Runtime phase records and artifact delivery over the protected DSH bridge. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Commands from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as mcp from '@deepseek-ai/dsh-mcp-client'
import * as cases from '@deepseek-ai/dsh-experimental-openubmc-cases'
import { expect, it } from 'vitest'
import { z } from 'zod'
import * as runtime from '../src/index.ts'

const workflow = process.env.DSH_OPENUBMC_WORKFLOW
const root = fileURLToPath(new URL('../../../../', import.meta.url))
it.skipIf(workflow === undefined)('retains phase records, artifacts and evidence across restart without converting gates into device grants', async () => {
  const state = await mkdtemp(join(tmpdir(), 'dsh-workflow-phase-'))
  let events: readonly SessionEvent[] = []
  try {
    for (let generation = 0; generation < 4; generation++) {
      const ctx = new Context()
      try {
        for (const plugin of [Sessions, Projections, Commands, SystemPrompt, Tools]) await ctx.plugin(plugin)
        await ctx.plugin(cases, { serverName: 'runtime' })
        await ctx.plugin(runtime, { serverName: 'runtime', operationDeadlineSeconds: 10, completionGraceMs: 1000, workflowMaxSteps: 1, evidenceReadLimitBytes: 1024 })
        await ctx.plugin(mcp, { serverName: 'runtime', transport: 'stdio', command: 'python3',
          args: [join(root, 'scripts/openubmc/runtime_stdio.py'), '--entry', join(root, 'packages/experimental/openubmc-runtime/tests/fixtures/python-runtime.py')],
          env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: state, DSH_RUNTIME_SCENARIO: 'phases-complete' },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInText: true, structuredContentInMeta: true,
          failOnStartupError: true, toolCallTimeoutMs: 11000 })
        const session = ctx.sessions.create(SessionId('workflow-phase-owner'), { seed: [...events] })
        const agent: Agent = { id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle', send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {}, runMaintenance: task => task(new AbortController().signal) }
        const execute = async (operation: string, args: object = {}) => {
          const callId = ToolCallId(`phase-${session.seq}`)
          const name = mcp.publicToolName('runtime', operation)
          const callEvent = session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
          const result = await ctx.tools.execute({ name, callId, arguments: args, agent, signal: new AbortController().signal })
          session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, content: result.content, isError: result.isError }), ...(result.meta === undefined ? {} : { meta: result.meta }) }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] })
          return result
        }
        const command = (line: string) => ctx.commands.execute(agent, line, [], new AbortController().signal)
        const read = async () => z.object({ mcp: z.object({ structuredContent: z.object({ revision: z.number(), phase_records: z.array(z.json()), evidence_refs: z.array(z.json()) }).loose() }) }).parse((await execute('case_read')).meta).mcp.structuredContent
        if (generation === 0) {
          await command('/target-authorize workflow.advance,workflow.next')
          const start = await execute('workflow.advance', { ip: '192.0.2.80', intent: 'diagnose-and-fix', delivery_strategy: 'build-upgrade', max_steps: 1, workflow: { debug: { deadline: 10 }, verification: { deadline: 10 }, upgrade: { deadline: 10 } } })
          expect(start.isError, JSON.stringify(start.content)).toBe(false)
          const gate = await read()
          const missing = await execute('phase_record', { expected_revision: gate.revision, idempotency_key: 'invalid-build', phase_type: 'build.artifact', producer_identity: 'openubmc-build', status: 'completed', summary: 'missing source revision' })
          expect(missing.isError).toBe(true)
          expect(ctx.sessionProjections.stateOf(session, 'openubmc/runtime')?.operations).toEqual(['workflow.advance', 'workflow.next'])
          const current = await read()
          expect((await execute('phase_record', { expected_revision: current.revision, idempotency_key: 'developer', phase_type: 'developer.change', producer_identity: 'openubmc-developer', status: 'completed', source_revision: 'source-revision', summary: 'source change completed', authored_files: ['src/fix.lua'], verification_plan: ['fresh verification'] })).isError).toBe(false)
          const changed = await read()
          expect((await execute('phase_record', { expected_revision: changed.revision, idempotency_key: 'build', phase_type: 'build.artifact', producer_identity: 'openubmc-build', status: 'completed', source_revision: 'source-revision', summary: 'firmware artifact completed', artifact_path: '/tmp/product.hpm', artifact_sha256: 'a'.repeat(64), product_version: '1.2.3' })).isError).toBe(false)
        } else {
          const persisted = await read()
          expect(JSON.stringify(persisted.phase_records)).toContain('build.artifact')
          expect(ctx.sessionProjections.stateOf(session, 'openubmc/runtime')?.workflowDeadlineSeconds, JSON.stringify(persisted.workflow_inputs)).toBe(10)
          const next = await execute('workflow.next')
          expect(next.isError, JSON.stringify(next.content)).toBe(false)
          if (generation === 3) expect(next.meta).toMatchObject({ mcp: { structuredContent: { status: 'completed' } } })
          await read()
          const view = ctx.sessionProjections.stateOf(session, 'openubmc/cases')!.view.cases[0]!
          expect(JSON.stringify(view.phaseRecords)).toContain('source-revision')
          expect(JSON.stringify(view.artifactRevisions)).toContain('a'.repeat(64))
          expect(view.evidenceRefs.length).toBeGreaterThan(0)
          expect((await command('/case-refresh'))?.result.kind).toBe('success')
          expect(session.snapshotEvents().some(event => event.type === 'openubmc/inspection')).toBe(true)
        }
        events = session.snapshotEvents()
      } finally { await ctx.fiber.dispose() }
    }
  } finally { await rm(state, { recursive: true, force: true }) }
}, 40_000)
