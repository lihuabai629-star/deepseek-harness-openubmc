/** Optional offline protocol check against a developer's openUBMC workflow checkout. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecution } from '@deepseek-ai/dsh-tools'
import { expect, it } from 'vitest'
import { startConnection, resolveReconnectPolicy } from '../src/connection.ts'

const workflow = process.env.DSH_OPENUBMC_WORKFLOW

it.skipIf(workflow === undefined)('discovers the Python Runtime and preserves structured Agent preflight errors across connection restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-'))
  try {
    for (let generation = 0; generation < 2; generation++) {
      const ctx = new Context()
      try {
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        const connection = startConnection(ctx, {
          transport: 'stdio', serverName: 'runtime', command: 'python3',
          args: [join(workflow!, 'openubmc-debug/scripts/target_runtime_mcp.py')], cwd: workflow!,
          env: { OPENUBMC_TARGET_RUNTIME_STATE_DIR: root, OPENUBMC_CREDENTIALS_FILE: join(root, 'absent.env') },
          toolCallTimeoutMs: 30_000, failOnStartupError: true, sessionIdMetadataKey: 'taskId',
          structuredContentInText: true, structuredContentInMeta: true,
        }, resolveReconnectPolicy({ enabled: false }, 'offline-runtime'))
        try {
          expect(await connection.ready).toEqual({})
          expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['mcp__runtime__observe', 'mcp__runtime__execute'])
          for (const id of ['session-a', 'session-b']) {
            const result = await ctx.tools.execute({
              name: 'mcp__runtime__observe', callId: ToolCallId(`status-${id}`), arguments: {},
              agent: { session: { id } } as NonNullable<ToolExecution['agent']>, signal: new AbortController().signal,
            })
            expect(result.isError).toBe(true)
            expect(JSON.stringify(result.content)).toContain('target')
            expect(result.meta).toMatchObject({ mcp: { structuredContent: { status: 'failed', error: { code: expect.any(String) } } } })
          }
        } finally {
          await connection.dispose()
          expect(ctx.tools.schemas()).toEqual([])
        }
      } finally {
        await ctx.fiber.dispose()
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
