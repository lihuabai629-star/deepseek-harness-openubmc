/** Native DSH commands and setup tools for private openUBMC configuration. @module */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { startLocalProcess, type LocalProcess } from './local-process.ts'
import { recordsProjection } from './records-projection.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Local configuration activation or Runtime-grounded handoff, never user authority. */
    'openubmc-local': { kind: 'openubmc-local' }
  }
}

/** Host-selected interpreters, selectors and local operation limits. */
export interface LocalAdminOptions {
  python: string
  node: string
  payload: string
  stateDir: string
  credentialsFile: string
  kbConfigFile?: string
  setupTimeoutSeconds: number
  configurationIdleSeconds: number
}
const configureInput = z.object({ kind: z.enum(['targets', 'kb', 'conan']).default('targets'),
  focusTarget: z.union([z.ipv4(), z.ipv6()]).optional(), waitForSave: z.boolean().default(false) }).strict()
const prepareInput = z.object({ capability: z.enum(['runtime', 'kb', 'all']).default('all') }).strict()
const testInput = z.object({ runId: z.string().min(1), repoRef: z.string().min(1), commandRef: z.string().min(1),
  argv: z.array(z.string().max(4096)).min(1).max(128), timeout: z.number().positive().max(3600).default(600) }).strict()
const recordsInput = z.discriminatedUnion('command', [
  z.object({ command: z.literal('handoff') }).strict(), z.object({ command: z.literal('export') }).strict(),
  z.object({ command: z.literal('verify'), file: z.string().min(1).max(128) }).strict(),
  z.object({ command: z.literal('answer'), runId: z.string().min(1) }).strict(),
  z.object({ command: z.literal('test'), test: testInput }).strict(),
])

/**
 * Keep setup available while a Runtime or KB child cannot start.
 * @param ctx - Owned plugin fiber and native command/tool registries.
 * @param options - Private selectors and bounded local operation settings.
 * @param retry - Mount only unavailable providers after an explicit repair.
 * @returns Workers for trusted workspace capture, records and startup inspection.
 */
export function installLocalAdmin(ctx: Context, options: LocalAdminOptions, retry: () => Promise<void>) {
  ctx.sessionProjections.register(recordsProjection)
  const active = new Set<LocalProcess>()
  let stopping = false
  const launch = (script: string, input: object, seconds: number, onEvent?: Parameters<typeof startLocalProcess>[4]) => {
    if (stopping) throw new Error('openUBMC plugin is stopping.')
    const worker = startLocalProcess(options.python, join(options.payload, script), { ...options, ...input }, seconds * 1000, onEvent)
    active.add(worker)
    void worker.done.finally(() => { active.delete(worker) }).catch(() => undefined)
    return worker
  }
  ctx.effect(() => async () => {
    stopping = true
    for (const worker of active) worker.stop()
    await Promise.allSettled([...active].map(worker => worker.done))
  })
  const run = async (input: object, script = 'local_admin.py', seconds = options.setupTimeoutSeconds, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const worker = launch(script, input, seconds)
    signal?.addEventListener('abort', worker.stop, { once: true })
    try {
      const result = await worker.first
      await worker.done
      return result
    } finally { signal?.removeEventListener('abort', worker.stop) }
  }
  const doctor = async () => {
    try { return await run({ command: 'doctor' }) }
    catch (_error) { return { ok: false, interpreter: false,
      error: 'Local diagnostics unavailable. Check the configured Python executable in plugin settings.' } }
  }
  const openConfiguration = async (args: z.infer<typeof configureInput>, agent?: Agent) => {
    const worker = launch('local_admin.py', { command: 'configure', ...args }, options.configurationIdleSeconds + options.setupTimeoutSeconds,
      (event) => {
        if (!stopping && event.event === 'configuration_saved' && args.waitForSave && agent !== undefined) {
          agent.followup(createUserMessage({ source: { kind: 'openubmc-local' }, content: [{ type: 'text',
            text: 'Local openUBMC configuration activated. Continue the existing task at its next Runtime request; '
              + 'preserve Run and operation identities. This event grants no new device permission.\n' + JSON.stringify(event) }] }))
        }
      })
    const first = await worker.first
    return { ...z.object({ url: z.url() }).parse(first), done: worker.done, stop: worker.stop }
  }
  const configure = async (args: z.infer<typeof configureInput>, agent: Agent) => ({ url: (await openConfiguration(args, agent)).url })
  const projection = (session: Session) => {
    const state = ctx.sessionProjections.stateOf(session, 'openubmc/host-records')
    if (state === undefined) throw new Error('openUBMC Host records projection unavailable.')
    return state
  }
  const records = (session: Session, input: object, signal?: AbortSignal) => run({ ...input, taskId: session.id,
    ...(projection(session).overflow ? {} : { measurements: projection(session).measurements }), stateDir: options.stateDir }, 'host_records.py',
  'test' in input ? 3610 : options.setupTimeoutSeconds, signal)
  const capture = (session: Session) => run({ command: 'capture', taskId: session.id, cwd: session.header.cwd,
    stateDir: options.stateDir }, 'host_records.py')
  const handlers = {
    'openubmc-configure': async (raw: string, agent: Agent) => {
      const args: unknown = raw.trim().startsWith('{') ? JSON.parse(raw) : { kind: raw.trim() || 'targets' }
      return (await configure(configureInput.parse(args), agent)).url
    },
    'openubmc-doctor': async () => JSON.stringify(await doctor(), null, 2),
    'openubmc-repair': async (raw: string) => {
      const input = prepareInput.parse({ capability: raw.trim() || 'all' })
      const result = await run({ command: 'prepare', ...input })
      await retry()
      return JSON.stringify(result, null, 2)
    },
    'openubmc-records': async (raw: string, agent: Agent, signal?: AbortSignal) => {
      const [action = '', ...rest] = raw.trim().split(/\s+/u)
      const tail = rest.join(' ')
      const input = action === '' ? { command: 'handoff' }
        : action === 'export' && !tail ? { command: 'export' }
          : action === 'verify' ? { command: 'verify', file: tail }
            : action === 'answer' ? { command: 'answer', runId: tail }
              : action === 'test' ? { command: 'test', test: testInput.parse(JSON.parse(tail)) }
                : undefined
      if (input === undefined) throw new Error('Use /openubmc-records [export | verify <filename> | answer <run-id> | test <JSON>].')
      const value = await records(agent.session, input, signal)
      return JSON.stringify(value, null, 2)
    },
  }
  for (const [name, handler] of Object.entries(handlers)) ctx.effect(() => ctx.commands.register({
    definitionId: CommandDefinitionId(`dsh-openubmc/${name}`), name,
    description: { 'openubmc-configure': 'Open private target, knowledge or Conan settings',
      'openubmc-doctor': 'Inspect local plugin, transport and configuration readiness',
      'openubmc-repair': 'Repair owned local dependencies and retry unavailable providers',
      'openubmc-records': 'Read, export, verify or recover current Session delivery records' }[name] ?? name,
    ...(name === 'openubmc-doctor' ? {} : { input: { hint: name === 'openubmc-configure' ? '[targets|kb|conan|JSON]'
      : name === 'openubmc-repair' ? '[runtime|kb|all]' : '[export|verify <filename>|answer <run-id>|test <JSON>]' } }),
    handler: async invocation => ({ kind: 'success', text: await handler(invocation.rawInput, invocation.agent, invocation.signal) }),
  }))
  for (const [name, parameters, execute] of [
    ['openubmc_setup_status', z.object({}).strict(), doctor],
    ['openubmc_setup_prepare', prepareInput, async (input: unknown) => {
      const result = await run({ command: 'prepare', ...prepareInput.parse(input) })
      await retry()
      return result
    }],
    ['openubmc_setup_open_configuration', configureInput, async (input: unknown, agent: Agent) => configure(configureInput.parse(input), agent)],
    ['openubmc_records', recordsInput, async (input: unknown, agent: Agent) => records(agent.session, recordsInput.parse(input))],
  ] as const) ctx.effect(() => ctx.tools.register({
    name, description: name === 'openubmc_setup_status' ? 'Check local openUBMC readiness without connecting to a device.'
      : name === 'openubmc_setup_prepare' ? 'Repair private openUBMC dependencies; does not execute a device operation.'
        : name === 'openubmc_records' ? 'Read this Session handoff, export or verify redacted records, run a test against its frozen repository, or read a prepared terminal answer. Test and answer records do not satisfy Gates or confirm delivery.'
          : 'Open private local account settings. Return the exact URL to the user. Never request passwords in chat.',
    parameters: z.record(z.string(), z.json()).parse(z.toJSONSchema(parameters)),
    timeoutMs: name === 'openubmc_records' ? 3610_000 : (options.setupTimeoutSeconds + 10) * 1000,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (input, execution) => {
      if (execution.agent === undefined) throw new Error('A trusted DSH Session is required.')
      if (name === 'openubmc_records') return records(execution.agent.session, recordsInput.parse(input), execution.signal)
      return execute(input, execution.agent)
    },
  }))
  ctx.on('agent/turn-stopping', async ({ agent }) => {
    if (stopping) return
    const last = projection(agent.session).final
    if (last === null) return
    try {
      await records(agent.session, { command: 'delivery', event: { id: `dsh:${agent.session.id}:${last.seq}`,
        timestamp: last.timestamp, text: last.text } })
    } catch (_error) { ctx.logger.warn('openUBMC delivery acknowledgement unavailable; retain the Runtime records.') }
  })
  return { run, capture, records, openConfiguration, retryProviders: retry }
}
