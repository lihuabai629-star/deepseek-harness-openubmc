import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { createMcpToolDefinition } from '../src/index.ts'

describe('MCP result callback adaptation', () => {
  it.each([false, true])('preserves structured values and includes them in text only when enabled (%s)', async (includeStructured) => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      let execution: ToolExecution | undefined
      ctx.on('tools/execute', (exec, next) => {
        execution = exec
        return next()
      })
      const call = vi.fn(async () => ({
        content: [{ type: 'text', text: 'Observed window.' }],
        structuredContent: { window: 7 },
      }))
      ctx.tools.register(createMcpToolDefinition(ctx, {
        name: 'native_window', rawName: 'window', description: 'Read the selected window.',
        inputSchema: { type: 'object', properties: { window: { type: 'integer' } } },
        outputSchema: { type: 'object', properties: { window: { type: 'integer' } }, required: ['window'] },
        call, structuredContentInText: includeStructured,
      }))
      const signal = new AbortController().signal
      const result = await ctx.tools.execute({
        name: 'native_window', callId: ToolCallId('window-call'), arguments: { window: 7 }, signal,
      })
      expect(call).toHaveBeenCalledWith({ window: 7 }, execution)
      expect(execution?.signal).toBe(signal)
      expect(result.isError).toBe(false)
      expect(result.content).toEqual([{ type: 'text', text: includeStructured ? 'Observed window.\n{"window":7}' : 'Observed window.' }])
      expect(result.value).toEqual({
        content: [{ type: 'text', text: 'Observed window.' }], structuredContent: { window: 7 },
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps structured text beside image refusal diagnostics', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      ctx.tools.register(createMcpToolDefinition(ctx, {
        name: 'image_case', rawName: 'image_case', description: 'Read Case evidence.',
        inputSchema: { type: 'object' }, structuredContentInText: true,
        call: async () => ({
          content: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }],
          structuredContent: { case_id: 'case-7' },
        }),
      }))
      const result = await ctx.tools.execute({
        name: 'image_case', callId: ToolCallId('image-case'), arguments: {}, signal: new AbortController().signal,
      })
      expect(result.isError).toBe(false)
      const first = result.content[0]
      expect(first?.type).toBe('text')
      if (first?.type === 'text') expect(first.text).toContain('image unavailable')
      expect(result.content.at(-1)).toEqual({ type: 'text', text: '\n{"case_id":"case-7"}' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each(['blocked', 'cancelled', 'failed', 'mutation_outcome_unknown'])(
    'retains recovery details in a %s failure', async (status) => {
      const ctx = new Context()
      try {
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        const envelope = { case_id: 'case-7', status, evidence_refs: ['evidence-1'], next_actions: ['case_read'] }
        ctx.tools.register(createMcpToolDefinition(ctx, {
          name: 'domain_failure', rawName: 'debug_run', description: 'Read diagnostic state.',
          inputSchema: { type: 'object' },
          call: async () => ({ content: [{ type: 'text', text: '需要恢复' }], structuredContent: envelope, isError: true }),
        }))
        const result = await ctx.tools.execute({
          name: 'domain_failure', callId: ToolCallId('failure'), arguments: {}, signal: new AbortController().signal,
        })
        expect(result.isError).toBe(true)
        expect(result.value).toBeUndefined()
        expect(result.content).toEqual([{ type: 'text', text: `Error: 需要恢复\n${JSON.stringify(envelope)}` }])
      } finally {
        await ctx.fiber.dispose()
      }
    },
  )

  it.each([null, { content: [42] }, { content: [{ type: 'image' }] }])(
    'rejects invalid external results before exposing content (%j)', async (invalid) => {
      const ctx = new Context()
      try {
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        ctx.tools.register(createMcpToolDefinition(ctx, {
          name: 'invalid_result', rawName: 'invalid', description: 'External result fixture.',
          inputSchema: { type: 'object' }, call: async () => invalid,
        }))
        const result = await ctx.tools.execute({
          name: 'invalid_result', callId: ToolCallId('invalid-call'), arguments: {},
          signal: new AbortController().signal,
        })
        expect(result.isError).toBe(true)
        expect(result.value).toBeUndefined()
      } finally {
        await ctx.fiber.dispose()
      }
    },
  )
})
