/** Real MCP timeout, cancellation, disconnect and restart recovery without target access. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
import { expect, it, vi } from 'vitest'
import * as runtime from '../src/index.ts'

it.each(['timeout', 'cancel', 'disconnect', 'complete'])('preserves %s outcomes and requires read-before-retry after real transport loss', async (mode) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-recovery-protocol-'))
  const marker = join(directory, 'started.txt')
  let events: readonly SessionEvent[] = []
  try {
    for (let generation = 0; generation < (mode === 'complete' ? 1 : 2); generation++) {
      const ctx = new Context()
      try {
        await ctx.plugin(Sessions)
        await ctx.plugin(Projections)
        await ctx.plugin(Commands)
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(Tools)
        await ctx.plugin(runtime, { serverName: 'runtime', operationDeadlineSeconds: 1, completionGraceMs: 100, workflowMaxSteps: 1, evidenceReadLimitBytes: 65536 })
        await ctx.plugin(mcp, {
          serverName: 'runtime', transport: 'stdio', command: process.execPath,
          args: [fileURLToPath(new URL('./fixtures/recovery-runtime.mjs', import.meta.url))],
          env: { DSH_RECOVERY_MODE: generation === 0 ? mode : 'complete', DSH_RECOVERY_MARKER: marker },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'],
          structuredContentInMeta: true, failOnStartupError: true, toolCallTimeoutMs: 1200,
          reconnect: { enabled: true, initialDelayMs: 1, maxDelayMs: 10, maxAttempts: 3 },
        })
        const session = ctx.sessions.create(SessionId('wire-recovery'), { seed: [...events] })
        const agent: Agent = {
          id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
          send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
          runMaintenance: task => task(new AbortController().signal),
        }
        const execute = async (operation: string, signal = new AbortController().signal) => {
          const name = mcp.publicToolName('runtime', operation)
          const callId = ToolCallId(`wire-${session.seq}`)
          const callEvent = session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: '{}' })
          const result = await ctx.tools.execute({ name, callId, arguments: {}, agent, signal })
          session.append('tool/result', { turn: 1, step: 1,
            message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
            ...(result.meta === undefined ? {} : { meta: result.meta }),
          }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] })
          return result
        }
        const grant = () => ctx.commands.execute(agent, '/target-authorize debug_run', [], new AbortController().signal)
        if (generation === 0) {
          await grant()
          const controller = new AbortController()
          const running = execute('debug_run', controller.signal)
          if (mode === 'cancel') {
            await vi.waitFor(async () => { expect(await readFile(marker, 'utf8')).toBe('started\n') })
            controller.abort(new Error('caller stopped waiting'))
          }
          const result = await running
          expect(result.isError).toBe(mode !== 'complete')
          if (mode !== 'complete') {
            expect(result.meta).toMatchObject({ mcp: { dispatchStatus: 'unknown' } })
            await vi.waitFor(() => { expect(ctx.tools.schemas().map(tool => tool.name)).toContain(mcp.publicToolName('runtime', 'case_read')) })
            expect((await execute('debug_run')).isError).toBe(true)
            expect(await readFile(marker, 'utf8')).toBe('started\n')
            await expect(grant()).rejects.toThrow('reconcile mutation records')
            await vi.waitFor(async () => {
              expect((await execute('case_read')).isError).toBe(false)
            }, { timeout: 5_000 })
            expect((await execute('debug_run')).isError).toBe(true)
          }
          events = session.snapshotEvents()
        } else {
          expect((await execute('debug_run')).isError).toBe(true)
          await execute('case_read')
          await grant()
          expect((await execute('debug_run')).isError).toBe(false)
          expect(await readFile(marker, 'utf8')).toBe('started\nstarted\n')
        }
      } finally { await ctx.fiber.dispose() }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 15_000)
