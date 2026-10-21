/** Public tool-executor fixture with durable call/result recording. @module */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Commands from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { createMcpToolDefinition, publicToolName } from '@deepseek-ai/dsh-mcp-client'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as runtime from '../src/index.ts'

export const config = { serverName: 'runtime', operationDeadlineSeconds: 10, observationDeadlineSeconds: 20, completionGraceMs: 1000 }
/** Build an isolated Session fixture.
 * @param seed - Recorded events for restart.
 * @param limits - Current caller wait limits.
 * @returns owned context and public drivers.
 */
export async function bench(seed: readonly SessionEvent[] = [], limits = config) {
  const ctx = new Context()
  try {
    await ctx.plugin(Sessions)
    await ctx.plugin(Projections)
    await ctx.plugin(Commands)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const fiber = await ctx.plugin(runtime, limits)
    const session = ctx.sessions.create(SessionId('agent-owner'), { seed: [...seed] })
    const agent: Agent = { id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
      send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
      runMaintenance: task => task(new AbortController().signal) }
    const command = (line: string, owner = agent) => ctx.commands.execute(owner, line, [], new AbortController().signal)
    const register = (rawName: string, call: Parameters<typeof createMcpToolDefinition>[1]['call'], timeout = 21000) =>
      ctx.tools.register(createMcpToolDefinition(ctx, { name: publicToolName('runtime', rawName), rawName, metadataServerName: 'runtime',
        sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], toolCallTimeoutMs: timeout,
        description: rawName, inputSchema: { type: 'object' }, call, structuredContentInText: true }))
    const execute = async (rawName: string, args: object = {}, owner = agent) => {
      const callId = ToolCallId(`call-${owner.session.seq}`)
      const name = publicToolName('runtime', rawName)
      const callEvent = owner.session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) })
      const result = await ctx.tools.execute({ name, callId, arguments: args, agent: owner, signal: new AbortController().signal })
      owner.session.append('tool/result', { turn: 1, step: 1,
        message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
        ...(result.meta === undefined ? {} : { meta: result.meta }),
        ...(result.error?.info === undefined ? {} : { error: result.error.info }),
      }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] })
      return { ...result, callId }
    }
    return { ctx, session, agent, command, register, execute, fiber }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

/** A wire Turn fixture with a versioned Gate. @param runId - Runtime identity. @returns protocol response. */
export function response(runId = 'run-owned') {
  return { content: [{ type: 'text', text: 'Runtime waiting for diagnosis acceptance' }], structuredContent: {
    schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: runId, state: 'waiting_response',
    gate: { gate_id: 'gate-owned', gate_version: 1, schema_digest: 'sha256:abc', input_schema: { type: 'object' } },
    incident: null, facts: [], gaps: [], outcome: null, next: 'respond to the current Gate',
  } }
}
