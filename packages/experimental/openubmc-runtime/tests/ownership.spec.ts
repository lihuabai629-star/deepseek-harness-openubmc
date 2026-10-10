/** Session ownership through the public MCP tool executor. */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Commands from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { expect, it, vi } from 'vitest'
import * as runtime from '../src/index.ts'

it('denies foreign Cases, keeps resume identity and requires a fresh human grant after fork', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Sessions)
    await ctx.plugin(Projections)
    await ctx.plugin(Commands)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const fiber = await ctx.plugin(runtime, { serverName: 'runtime' })
    ctx.commands.register({ name: 'noop', description: 'Unrelated user command', handler: () => ({ kind: 'success' }) })
    const session = ctx.sessions.create(SessionId('owner-a'))
    const agent: Agent = {
      id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
      send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
      runMaintenance: task => task(new AbortController().signal),
    }
    const call = vi.fn(async (_args: Record<string, unknown>) => ({ content: [{ type: 'text', text: 'ok' }] }))
    for (const rawName of ['case_read', 'debug_run']) ctx.tools.register(createMcpToolDefinition(ctx, {
      name: rawName, rawName, metadataServerName: 'runtime', sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], description: rawName,
      inputSchema: { type: 'object' }, call,
    }))
    const execute = (owner: Agent, name: string, args: object = {}) => ctx.tools.execute({
      name, callId: ToolCallId('ownership-call'), arguments: args, agent: owner, signal: new AbortController().signal,
    })
    await ctx.commands.execute(agent, '/noop', [], new AbortController().signal)
    expect((await execute(agent, 'case_read', { case_id: 'foreign' })).isError).toBe(true)
    expect(call).not.toHaveBeenCalled()
    expect((await execute(agent, 'case_read')).isError).toBe(false)
    expect(call.mock.calls.at(-1)?.[0]).toEqual({ case_id: runtime.sessionCaseId(session.id) })
    expect((await execute(agent, 'debug_run')).isError).toBe(true)
    expect((await ctx.commands.execute(agent, '/target-authorize debug_run', [], new AbortController().signal))?.result.kind).toBe('success')
    expect((await execute(agent, 'debug_run')).isError).toBe(false)
    const replaceCase = ctx.on('mcp/tool-call', (request, next) => {
      request.arguments = { case_id: 'foreign' }
      return next()
    })
    const callsBefore = call.mock.calls.length
    expect((await execute(agent, 'debug_run')).isError).toBe(true)
    expect(call).toHaveBeenCalledTimes(callsBefore)
    replaceCase()
    await expect(ctx.commands.execute(agent, '/target-authorize unsupported', [], new AbortController().signal)).rejects.toThrow('Usage:')
    expect((await execute(agent, 'debug_run')).isError).toBe(false)
    expect((await ctx.commands.execute(agent, '/target-authorize revoke', [], new AbortController().signal))?.result.kind).toBe('success')
    expect((await execute(agent, 'debug_run')).isError).toBe(true)
    await ctx.commands.execute(agent, '/target-authorize debug_run', [], new AbortController().signal)
    for (const [name, serverName, key] of [
      ['runtime_status', 'runtime', 'taskId'], ['unknown', 'runtime', 'taskId'],
      ['no-key', 'runtime', undefined], ['unprotected', 'other', undefined],
    ] as const) ctx.tools.register(createMcpToolDefinition(ctx, {
      name, rawName: name, serverName, ...(key === undefined ? {} : { sessionIdMetadataKey: key }), description: name,
      ...(serverName === 'runtime' ? { requiredToolCallPolicies: ['openubmc-session-authority'] } : {}),
      inputSchema: { type: 'object' }, call,
    }))
    expect((await execute(agent, 'runtime_status')).isError).toBe(false)
    expect((await execute(agent, 'runtime_status', { case_id: runtime.sessionCaseId(session.id) })).isError).toBe(false)
    const alterStatus = ctx.on('mcp/tool-call', (request, next) => { request.arguments = { case_id: 'foreign' }; return next() })
    expect((await execute(agent, 'runtime_status')).isError).toBe(true)
    alterStatus()
    expect((await execute(agent, 'unknown')).isError).toBe(true)
    expect((await execute(agent, 'no-key')).isError).toBe(true)
    expect((await execute(agent, 'unprotected', { case_id: 'foreign' })).isError).toBe(false)
    expect((await ctx.tools.execute({ name: 'case_read', callId: ToolCallId('no-agent'), arguments: {}, signal: new AbortController().signal })).isError).toBe(true)
    const absent = vi.spyOn(ctx.sessionProjections, 'stateOf').mockReturnValueOnce(undefined)
    try {
      expect((await execute(agent, 'debug_run')).isError).toBe(true)
    } finally {
      absent.mockRestore()
    }
    const authority = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
    const absentAtDispatch = vi.spyOn(ctx.sessionProjections, 'stateOf').mockReturnValueOnce(authority).mockReturnValueOnce(undefined)
    try {
      expect((await execute(agent, 'debug_run')).isError).toBe(true)
    } finally { absentAtDispatch.mockRestore() }
    const revokeDuringDispatch = ctx.on('mcp/tool-call', async (_request, next) => {
      await ctx.commands.execute(agent, '/target-authorize revoke', [], new AbortController().signal)
      return next()
    })
    expect((await execute(agent, 'debug_run')).isError).toBe(true)
    revokeDuringDispatch()
    await ctx.commands.execute(agent, '/target-authorize debug_run', [], new AbortController().signal)
    const fork = ctx.sessions.fork(session, undefined, SessionId('owner-fork'))
    const forkAgent = { ...agent, id: fork.id, session: fork }
    expect((await execute(forkAgent, 'debug_run')).isError).toBe(true)
    expect((await execute(forkAgent, 'case_read', { case_id: runtime.sessionCaseId(session.id) })).isError).toBe(true)
    expect((await execute(forkAgent, 'case_read')).isError).toBe(false)
    expect(call.mock.calls.at(-1)?.[0]).toEqual({ case_id: runtime.sessionCaseId(fork.id) })
    await fiber.dispose()
    expect(await ctx.commands.execute(agent, '/target-authorize debug_run', [], new AbortController().signal)).toBeUndefined()
    expect(ctx.sessionProjections.stateOf(session, 'openubmc/runtime')).toBeUndefined()
    expect((await execute(agent, 'case_read', { case_id: 'foreign' })).isError).toBe(true)
    expect(JSON.stringify((await execute(agent, 'case_read')).content)).toContain('Required MCP tool-call policy is unavailable')
    await ctx.plugin(runtime, { serverName: 'runtime' })
    expect((await execute(agent, 'case_read')).isError).toBe(false)
  } finally {
    await ctx.fiber.dispose()
  }
})
