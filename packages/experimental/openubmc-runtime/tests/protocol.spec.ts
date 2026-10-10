/** Offline ownership and resume against the existing Python Runtime protocol. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Commands from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { publicToolName } from '@deepseek-ai/dsh-mcp-client/src/tools.ts'
import * as mcp from '@deepseek-ai/dsh-mcp-client'
import { expect, it } from 'vitest'
import * as runtime from '../src/index.ts'

const workflow = process.env.DSH_OPENUBMC_WORKFLOW
it.skipIf(workflow === undefined)('isolates explicit Cases on a shared real connection and resumes across Runtime restart', async () => {
  const state = await mkdtemp(join(tmpdir(), 'openubmc-ownership-'))
  let events: readonly SessionEvent[] = []
  try {
    for (let generation = 0; generation < 2; generation++) {
      const ctx = new Context()
      try {
        await ctx.plugin(Sessions)
        await ctx.plugin(Projections)
        await ctx.plugin(Commands)
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(Tools)
        await ctx.plugin(runtime, { serverName: 'runtime' })
        await ctx.plugin(mcp, {
          serverName: 'runtime', transport: 'stdio', command: 'python3',
          args: [join(workflow!, 'openubmc-debug/scripts/target_runtime_mcp.py')], cwd: workflow!,
          env: { OPENUBMC_TARGET_RUNTIME_STATE_DIR: state, OPENUBMC_CREDENTIALS_FILE: join(state, 'absent.env') },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInMeta: true, structuredContentInText: true,
          failOnStartupError: true, toolCallTimeoutMs: 30_000,
        })
        const session = ctx.sessions.create(SessionId('protocol-owner'), { seed: [...events] })
        const owner: Agent = {
          id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
          send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
          runMaintenance: task => task(new AbortController().signal),
        }
        const execute = (agent: Agent, name: string, args: object = {}) => ctx.tools.execute({
          name: publicToolName('runtime', name), callId: ToolCallId(`protocol-${name}`), arguments: args,
          agent, signal: new AbortController().signal,
        })
        if (generation === 0) {
          const grant = await ctx.commands.execute(owner, '/target-authorize workflow.advance', [], new AbortController().signal)
          expect(grant?.result.kind).toBe('success')
          const started = await execute(owner, 'workflow.advance', { intent: 'diagnose-and-fix', delivery_strategy: 'source-only', max_steps: 1 })
          expect(started.meta, JSON.stringify(started.content)).toMatchObject({
            mcp: { structuredContent: { case_id: runtime.sessionCaseId(session.id) } },
          })
        }
        const read = await execute(owner, 'case_read')
        expect(read.isError, JSON.stringify(read.content)).toBe(false)
        expect(read.value).toMatchObject({ structuredContent: { case_id: runtime.sessionCaseId(session.id) } })
        const foreignSession = ctx.sessions.create(SessionId(`protocol-other-${generation}`))
        const foreign = { ...owner, id: foreignSession.id, session: foreignSession }
        for (const name of ['case_read', 'case_close', 'case_forget', 'evidence_read', 'phase_record', 'workflow.next']) {
          const result = await execute(foreign, name, { case_id: runtime.sessionCaseId(session.id) })
          expect(result.isError).toBe(true)
          expect(JSON.stringify(result.content)).toContain('does not belong')
          expect(result.meta).toBeUndefined()
        }
        expect((await execute(owner, 'case_read')).isError).toBe(false)
        expect(ctx.sessionProjections.stateOf(session, 'openubmc/runtime')?.operations).toEqual(['workflow.advance'])
        events = JSON.parse(JSON.stringify(session.snapshotEvents())) as SessionEvent[]
      } finally {
        await ctx.fiber.dispose()
      }
    }
  } finally {
    await rm(state, { recursive: true, force: true })
  }
}, 30_000)
