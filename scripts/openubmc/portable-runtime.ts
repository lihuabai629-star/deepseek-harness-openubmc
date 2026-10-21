/** Public Host tool registrations with plugin-owned MCP identity and authority. @module */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { z } from 'zod'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type { McpToolCall } from '@deepseek-ai/dsh-mcp-client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import type { Session } from '@deepseek-ai/dsh-session'
import type { OpenUbmcRuntimeState } from '@deepseek-ai/dsh-experimental-openubmc-runtime/types'
import { createRuntimeController } from '@deepseek-ai/dsh-experimental-openubmc-runtime'
import { SessionAuthority, authorityInput } from './session-authority.ts'

const serverName = 'openubmc-target-runtime'
const publicToolName = (_server: string, rawName: string) => `mcp__${serverName}__${rawName}`
const object = z.record(z.string(), z.json())
const resultSchema = z.object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  structuredContent: object.optional(), isError: z.boolean().optional() })
type Result = z.infer<typeof resultSchema>

/** Resolved interpreters, paths and waits for the portable Runtime provider. */
export interface PortableRuntimeOptions {
  python: string
  payload: string
  workflow: string
  stateDir: string
  credentialsFile: string
  operationDeadlineSeconds: number
  observationDeadlineSeconds: number
  completionGraceMs: number
  toolCallTimeoutMs: number
  authorityLockWaitMs: number
  /** Trusted workspace capture before a new Run; absent only in protocol fixtures. */
  captureWorkspace?: (session: Session) => Promise<unknown>
}

/**
 * Register observe/execute through public tool APIs; dispose drains owned calls and transport.
 * @param ctx - Plugin fiber with public Host tool, command and prompt services.
 * @param options - Validated deployment configuration.
 * @returns A synchronous reader of validated private Session associations.
 */
export async function installPortableRuntime(
  ctx: Context, options: PortableRuntimeOptions,
): Promise<(session: Session) => OpenUbmcRuntimeState> {
  const controller = createRuntimeController({ serverName, ...options })
  ctx.sessionProjections.register(controller.projection)
  const journal = new SessionAuthority(join(options.stateDir, 'dsh-sessions'), controller, options.authorityLockWaitMs,
    (session, currentCall) => {
      const state = ctx.sessionProjections.stateOf(session, 'openubmc/runtime')
      if (state === undefined) throw new Error('openUBMC Session history projection is unavailable.')
      return Object.keys(state.runs).length > 0 || Object.keys(state.uncertainCalls).length > 0
        || Object.keys(state.pendingCalls).some(id => id !== currentCall)
    })
  let client: Client | undefined
  let connecting: Promise<Client> | undefined
  const makeTransport = () => new StdioClientTransport({ command: options.python,
    args: ['-B', join(options.payload, 'runtime_stdio.py'), '--entry', join(options.workflow, 'openubmc-debug/scripts/target_runtime_mcp.py')],
    cwd: options.workflow, env: { ...scrubbedParentEnv(), OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: 'agent',
      OPENUBMC_TARGET_RUNTIME_STATE_DIR: options.stateDir, OPENUBMC_CREDENTIALS_FILE: options.credentialsFile } })
  const stopping = new AbortController()
  const calls = new Set<Promise<Result>>()
  const outcomes = new Map<ToolExecutionToken, { result: Result; meta: z.infer<typeof object> }>()
  ctx.effect(() => async () => {
    stopping.abort()
    await Promise.allSettled([...calls])
    await connecting?.catch(() => undefined)
    await client?.close()
  })
  const connect = async (): Promise<Client> => {
    stopping.signal.throwIfAborted()
    if (client !== undefined) return client
    if (connecting !== undefined) return connecting
    const pending = (async () => {
      const next = new Client({ name: 'dsh-openubmc', version: '0.2.0' })
      next.onclose = () => { if (client === next) client = undefined }
      try {
        await next.connect(makeTransport(), { timeout: options.toolCallTimeoutMs, signal: stopping.signal })
        if (stopping.signal.aborted) throw new Error('openUBMC plugin is stopping.')
        client = next
        return next
      } catch (error) { await next.close(); throw error }
    })()
    connecting = pending
    try { return await pending } finally { connecting = undefined }
  }
  const advertised = await (await connect()).listTools()
  if (JSON.stringify(advertised.tools.map(tool => tool.name).sort()) !== JSON.stringify(['execute', 'observe'])) {
    throw new Error('openUBMC requires exactly the native observe/execute Agent interface.')
  }

  const invoke = async (request: McpToolCall): Promise<Result> => {
    const session = request.execution.agent?.session
    let dispatchStatus: 'not-started' | 'unknown' | undefined = 'not-started'
    let result: Result
    if (session === undefined) throw new Error('openUBMC requires a trusted Host Session.')
    const run = async (): Promise<Result> => {
      try {
        const prepared = await journal.update(session, request.execution.callId, (state) => {
          controller.prepare(request, state)
          if (request.toolName !== 'execute') return state
          return journal.fold(state, authorityInput({ type: 'tool/call', data: { turn: 0, step: 0,
            callId: request.execution.callId, name: publicToolName(serverName, 'execute'), arguments: JSON.stringify(request.arguments) } }))
        })
        if (!controller.prepare(request, prepared)) {
          const revision = journal.read(session).revision
          await controller.requestAuthorization(ctx, request, async (arguments_) => {
            await journal.update(session, request.execution.callId, (state) => {
              if (journal.read(session).revision !== revision) {
                throw new Error('Session authority changed while authorization was pending. Propose the task again.')
              }
              return journal.fold(state, authorityInput({ type: 'openubmc/authorization',
                data: { callId: request.execution.callId, arguments: arguments_ } }))
            })
          })
        }
        const signal = AbortSignal.any([request.execution.signal, stopping.signal])
        if (request.toolName === 'execute' && request.arguments.kind === 'start') {
          await options.captureWorkspace?.(session)
        }
        request.metadata.taskId = session.id
        const connected = await connect()
        result = resultSchema.parse(await journal.dispatch(session, request.execution.callId, (state) => {
          signal.throwIfAborted()
          if (!controller.prepare(request, state)) throw new Error('Target execution requires human authorization for this scope.')
          return state
        }, () => {
          dispatchStatus = 'unknown'
          return connected.callTool({ name: request.toolName, arguments: request.arguments, _meta: request.metadata },
            { signal, timeout: options.toolCallTimeoutMs })
        }))
        dispatchStatus = undefined
      } catch (error) {
        result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
      }
      const meta = { mcp: { serverName, toolName: request.toolName,
        ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }),
        ...(dispatchStatus === undefined ? {} : { dispatchStatus }) } }
      if (request.toolName === 'execute') {
        await journal.update(session, request.execution.callId, state => journal.fold(state, authorityInput({ type: 'tool/result',
          data: { turn: 0, step: 0, message: createToolResultMessage({ callId: request.execution.callId,
            content: result.content, isError: result.isError === true }), meta }, surfaceOp: 'append', sourceEventSeqs: [] })))
      }
      outcomes.set(request.execution.token, { result, meta })
      return result
    }
    return request.toolName === 'execute' ? journal.exclusive(session, run) : run()
  }

  // Public around-dispatch results admit metadata on failures, including in stock 0.1.7.
  ctx.on('tools/execute', async (execution, next) => {
    if (!advertised.tools.some(tool => execution.name === publicToolName(serverName, tool.name))) return next()
    const result = await next()
    const outcome = outcomes.get(execution.token)
    outcomes.delete(execution.token)
    return result.isError && outcome !== undefined ? { ...result, meta: outcome.meta } : result
  })
  for (const tool of advertised.tools) ctx.effect(() => ctx.tools.register({
    name: publicToolName(serverName, tool.name), description: tool.description ?? tool.name, parameters: tool.inputSchema,
    timeoutMs: options.toolCallTimeoutMs,
    output: { schema: { type: 'object' },
      render: (_args, value) => {
        const result = resultSchema.parse(value)
        return [{ type: 'text', text: render(result) }]
      },
      presentationMeta: (_args, value) => ({ mcp: { serverName, toolName: tool.name,
        structuredContent: resultSchema.parse(value).structuredContent ?? {} } }),
    },
    execute: async (args, execution) => {
      if (stopping.signal.aborted) throw new Error('openUBMC plugin is stopping.')
      const request: McpToolCall = { serverName, toolName: tool.name,
        execution: { ...execution, signal: AbortSignal.any([execution.signal, stopping.signal]) }, arguments: object.parse(args),
        sessionIdMetadataKey: 'taskId', toolCallTimeoutMs: options.toolCallTimeoutMs, appliedPolicies: new Map(), metadata: {} }
      const call = invoke(request)
      calls.add(call)
      let result: Result
      try { result = await call } finally { calls.delete(call) }
      if (result.isError) throw new Error(render(result))
      return result
    },
  }))

  for (const name of ['target-authorize', 'target-reconcile', 'target-action']) ctx.effect(() => ctx.commands.register({
    definitionId: CommandDefinitionId(`dsh-openubmc/${name}`), name,
    description: name === 'target-authorize' ? 'Authorize target execution for this Session'
      : name === 'target-reconcile' ? 'Permit one exact replay of an unacknowledged start' : 'Continue an owned openUBMC Run',
    input: { hint: name === 'target-authorize' ? 'execute [target intent [delivery-strategy]] | revoke'
      : name === 'target-reconcile' ? '<original-call-id>' : '<execute action JSON>' },
    handler: async (invocation) => {
      const session = invocation.agent.session
      if (name === 'target-action') {
        const action = controller.parseContinuation(JSON.parse(invocation.rawInput))
        const result = await ctx.tools.execute({ name: publicToolName(serverName, 'execute'),
          callId: ToolCallId(`command:${invocation.commandId}`), arguments: action, agent: invocation.agent, signal: invocation.signal })
        return { kind: result.isError ? 'error' : 'success', text: result.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }
      }
      const commit = async () => {
        if (name === 'target-authorize') controller.commandGrant(invocation.rawInput.trim())
        else {
          const state = journal.read(session).state
          const id = ToolCallId(invocation.rawInput.trim())
          if ((state.uncertainCalls[id] ?? state.pendingCalls[id])?.arguments.kind !== 'start') {
            throw new Error('Only an unacknowledged start can be replayed; reconcile an existing Run through execute control.')
          }
        }
        await journal.update(session, undefined, (state) => {
          const pending = journal.fold(state, authorityInput({ type: 'command/run', data: {
            commandId: invocation.commandId, name, args: invocation.rawInput, source: { kind: 'user' } } }))
          return journal.fold(pending, authorityInput({ type: 'command/done', data: { commandId: invocation.commandId, kind: 'success' } }))
        })
      }
      if (name === 'target-reconcile') await journal.exclusive(session, commit)
      else await commit()
      return { kind: 'success', text: name === 'target-reconcile' ? 'One exact start replay authorized with its original Runtime identity.'
        : invocation.rawInput.trim() === 'revoke' ? 'Target execution authority revoked for this Session.' : 'Target execution authorized within the selected Session scope.' }
    },
  }))
  ctx.systemPrompt.section({ name: 'openubmc:workflow', order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'), text: controller.guidance })
  ctx.systemPrompt.context({ name: 'openubmc:runtime', order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
    text: context => context.agent === undefined ? '' : controller.renderContext(journal.read(context.agent.session).state) })
  return session => journal.read(session).state
}

function render(result: Result): string {
  return [...result.content.map(block => block.text),
    ...(result.structuredContent === undefined ? [] : [JSON.stringify(result.structuredContent)])].join('\n')
}
