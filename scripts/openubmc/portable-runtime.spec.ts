/** Portable provider authority, protocol failures and restart recovery. @module */
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Socket } from 'node:net'
import { existsSync, readdirSync } from 'node:fs'
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import Tools from '@deepseek-ai/dsh-tools'
import Commands from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { installCaseQueries } from '@deepseek-ai/dsh-experimental-openubmc-cases'
import { createRuntimeController } from '@deepseek-ai/dsh-experimental-openubmc-runtime'
import { installPortableRuntime } from './portable-runtime.ts'
import { SessionAuthority, authorityInput } from './session-authority.ts'

// The shipped provider requires Linux/WSL directory syncing and process semantics.
const portableTest = it.skipIf(process.platform !== 'linux')
const start = { kind: 'start', target: '192.0.2.39', intent: 'diagnose-and-fix' }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'openubmc-portable-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await copyFile(new URL('./fixtures/portable-runtime.py', import.meta.url), join(root, 'runtime_stdio.py'))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Sessions)
  await ctx.plugin(Projections)
  await ctx.plugin(Commands)
  await ctx.plugin(Tools)
  await ctx.plugin(SystemPrompt)
  const options = { payload: root, workflow: root, python: 'python3',
    stateDir: join(root, 'state'), credentialsFile: join(root, 'absent.env'), operationDeadlineSeconds: 1,
    observationDeadlineSeconds: 1, completionGraceMs: 1000, toolCallTimeoutMs: 30000, authorityLockWaitMs: 100 }
  const plugin = { name: 'portable-test', inject: ['tools', 'commands', 'systemPrompt', 'sessionProjections'],
    apply: async (child: Context) => {
      const authority = await installPortableRuntime(child, options)
      installCaseQueries(child, { serverName: 'openubmc-target-runtime' }, session =>
        Object.values(authority(session).runs).filter(run => run !== undefined))
    } }
  let fiber = await ctx.plugin(plugin)
  const session = ctx.sessions.create(SessionId('owner'))
  const agent: Agent = { id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'idle',
    send() {}, followup() {}, steer() {}, inject() {}, cancel() {}, whenIdle: async () => {},
    runMaintenance: task => task(new AbortController().signal) }
  let counter = 0
  const execute = async (args: object, owner = agent, signal = new AbortController().signal, name = 'execute') => {
    const callId = ToolCallId(`call-${counter++}`)
    const tool = `mcp__openubmc-target-runtime__${name}`
    const event = owner.session.append('tool/call', { turn: 0, step: 0, callId, name: tool, arguments: JSON.stringify(args) })
    const result = await ctx.tools.execute({ name: tool, callId, arguments: args, agent: owner, signal })
    owner.session.append('tool/result', { turn: 0, step: 0,
      message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
      ...(result.meta === undefined ? {} : { meta: result.meta }),
    }, { surfaceOp: 'append', sourceEventSeqs: [event.seq] })
    return result
  }
  const command = (line: string, owner = agent) => ctx.commands.execute(owner, line, [], new AbortController().signal)
  const callSchema = z.object({ _meta: z.record(z.string(), z.json()) })
  const calls = async () => (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n')
    .map(line => callSchema.parse(JSON.parse(line)))
  return { root, ctx, session, agent, execute, command, calls,
    remount: async () => { await fiber.dispose(); fiber = await ctx.plugin(plugin) } }
}

portableTest('retains failed Turn JSON and trusted identity on the public tool error path', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  const result = await f.execute({ ...start, purpose: 'fail' })
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.meta)).toContain('run-owner')
  expect(JSON.stringify(result.content)).toContain('schema_digest')
  const calls = await f.calls()
  expect(calls[0]?._meta.taskId).toBe('owner')
  expect(calls[0]?._meta['openubmc/operationId']).toMatch(/^dsh-[a-f0-9]{64}$/)
  expect(f.session.snapshotEvents().some(event => event.type.startsWith('openubmc/'))).toBe(false)
})

portableTest('resumes associations after remount and rejects another Session and fork permissions', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  expect((await f.execute(start)).isError).toBe(false)
  await f.remount()
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' })).isError).toBe(false)
  const foreign = f.ctx.sessions.create(SessionId('foreign'))
  const other = { ...f.agent, id: foreign.id, session: foreign }
  await f.command('/target-authorize execute', other)
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' }, other)).isError).toBe(true)
  const fork = f.ctx.sessions.fork(f.session)
  const child = { ...f.agent, id: fork.id, session: fork }
  expect((await f.execute(start, child)).isError).toBe(true)
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' }, child)).isError).toBe(true)
  expect((await f.calls())).toHaveLength(2)
})

portableTest('keeps unknown starts blocked and reconnects only for an explicit exact recovery', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  expect((await f.execute({ ...start, purpose: 'disconnect' })).isError).toBe(true)
  await f.remount()
  expect((await f.execute(start)).isError).toBe(true)
  await f.command('/target-reconcile call-0')
  expect((await f.execute(start)).isError).toBe(true)
  await f.command('/target-reconcile call-0')
  expect((await f.execute({ ...start, purpose: 'disconnect' })).isError).toBe(true)
  const calls = await f.calls()
  expect(calls).toHaveLength(2)
  expect(calls[0]?._meta).toEqual(calls[1]?._meta)
})

portableTest('revokes retained execution while preserving read-only diagnosis', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  await f.command('/target-authorize revoke')
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' })).isError).toBe(true)
  expect((await f.execute({ ...start, intent: 'diagnosis-only' })).isError).toBe(false)
  expect(await f.calls()).toHaveLength(2)
})

portableTest('fails closed on a corrupt authority record after an executed task', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  const directory = join(f.root, 'state/dsh-sessions')
  const file = (await readdir(directory)).find(name => name.endsWith('.json'))
  if (file === undefined) throw new Error('The authority record is missing.')
  await writeFile(join(directory, file), '{}')
  expect((await f.execute(start)).isError).toBe(true)
  expect(await f.calls()).toHaveLength(1)
})

portableTest('persists one exact human-approved Run without adding required custom Host events', async () => {
  const f = await fixture()
  await f.ctx.plugin(AgentRegistry)
  await f.ctx.plugin(UserQuestions)
  onTestFinished(f.ctx.agents.enter(f.agent, undefined))
  let questions = 0
  f.ctx.on('user-questions/request', async () => {
    questions += 1
    return { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run'] }] }
  })
  expect((await f.execute(start)).isError).toBe(false)
  await f.remount()
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' })).isError).toBe(false)
  expect(questions).toBe(1)
  expect(f.session.snapshotEvents().some(event => event.type.startsWith('openubmc/'))).toBe(false)
})

portableTest('records cancellation as unknown and requires same-Run reconciliation before another effect', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  const abort = new AbortController()
  const pending = f.execute({ kind: 'resume', run_id: 'run-owner', purpose: 'wait' }, f.agent, abort.signal)
  await expect.poll(async () => (await f.calls()).length).toBe(2)
  abort.abort()
  const cancelled = await pending
  expect(cancelled.isError).toBe(true)
  expect(JSON.stringify(cancelled.meta)).toContain('unknown')
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' })).isError).toBe(true)
  expect((await f.execute({ kind: 'control', command: 'reconcile', run_id: 'run-owner' })).isError).toBe(false)
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner' })).isError).toBe(false)
  expect(await f.calls()).toHaveLength(4)
})

portableTest('rejects stale Gate bindings and oversized caller waits before dispatch', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  expect((await f.execute({ kind: 'respond', run_id: 'run-owner', gate_id: 'gate-one', gate_version: 2,
    schema_digest: 'sha256:abc' })).isError).toBe(true)
  expect((await f.execute({ kind: 'resume', run_id: 'run-owner', deadline: 2 })).isError).toBe(true)
  expect(await f.calls()).toHaveLength(1)
})

portableTest('refuses to reconstruct authority from history when the private record is missing', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  const directory = join(f.root, 'state/dsh-sessions')
  for (const name of await readdir(directory)) await rm(join(directory, name))
  const result = await f.execute(start)
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('authority is missing')
  expect(await f.calls()).toHaveLength(1)
})

portableTest('shows native command results in read-only Run queries after remount', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute(start)
  const action = await f.command('/target-action {"kind":"resume","run_id":"run-owner","purpose":"native-marker"}')
  expect(action?.result.kind).toBe('success')
  await f.remount()
  const query = await f.command('/run run-owner')
  expect(query?.result.text).toContain('native-marker')
  expect(await f.calls()).toHaveLength(2)
})

portableTest('checks revocation after a reconnect handshake and never sends the stale authorized start', async () => {
  const f = await fixture()
  await f.command('/target-authorize execute')
  await f.execute({ purpose: 'disconnect' }, f.agent, new AbortController().signal, 'observe')
  const barrier = createServer()
  const sockets = new Set<Socket>()
  barrier.on('connection', (socket) => { sockets.add(socket) })
  onTestFinished(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) => {
      barrier.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })
  await new Promise<void>((resolve) => { barrier.listen(0, '127.0.0.1', resolve) })
  const address = barrier.address()
  if (address === null || typeof address === 'string') throw new Error('The handshake barrier has no TCP address.')
  await writeFile(join(f.root, 'initialize-barrier.json'), JSON.stringify({ port: address.port }))
  const accepted = new Promise<Socket>((resolve) => { barrier.once('connection', resolve) })
  const abort = new AbortController()
  onTestFinished(() => { abort.abort() })
  const pending = f.execute(start, f.agent, abort.signal)
  const socket = await accepted
  await f.command('/target-authorize revoke')
  socket.end('x')
  const result = await pending
  expect(result.isError).toBe(true)
  expect(JSON.stringify(result.content)).toContain('requires human authorization')
  expect(await f.calls()).toHaveLength(1)
})

async function authorityFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openubmc-authority-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Sessions)
  const session = ctx.sessions.create(SessionId('authority-owner'))
  const controller = createRuntimeController({ serverName: 'openubmc-target-runtime',
    operationDeadlineSeconds: 1, observationDeadlineSeconds: 1, completionGraceMs: 1000 })
  const writer = new SessionAuthority(root, controller, 0, () => false)
  const other = new SessionAuthority(root, controller, 0, () => false)
  return { root, session, writer, other }
}

portableTest('commits pending authority before sending and releases the writer while the provider is pending', async () => {
  const f = await authorityFixture()
  const callId = ToolCallId('pending-authority')
  await f.writer.update(f.session, undefined, state => ({ ...state, operations: ['execute'] }))
  const started = Promise.withResolvers<true>()
  const settlement = Promise.withResolvers<string>()
  onTestFinished(() => { settlement.resolve('cleanup') })
  const pending = f.writer.dispatch(f.session, callId, state => f.writer.fold(state, authorityInput({
    type: 'tool/call', data: { turn: 0, step: 0, callId,
      name: 'mcp__openubmc-target-runtime__execute', arguments: JSON.stringify(start) },
  })), () => {
    expect(f.other.read(f.session).state.pendingCalls[callId]?.arguments).toEqual(start)
    const file = readdirSync(f.root).find(name => name.endsWith('.json'))
    if (file === undefined) throw new Error('The committed authority file is missing.')
    expect(existsSync(join(f.root, file + '.lock'))).toBe(true)
    started.resolve(true)
    return settlement.promise
  })
  await started.promise
  await expect.poll(async () => (await readdir(f.root)).some(name => name.endsWith('.lock'))).toBe(false)
  await f.other.update(f.session, undefined, state => ({ ...state, operations: [] }))
  expect(f.writer.read(f.session).state.operations).toEqual([])
  settlement.resolve('settled')
  expect(await pending).toBe('settled')
})

portableTest('rejects a dispatch when another writer has already revoked its authority', async () => {
  const f = await authorityFixture()
  await f.writer.update(f.session, undefined, state => ({ ...state, operations: ['execute'] }))
  await f.other.update(f.session, undefined, state => ({ ...state, operations: [] }))
  let submitted = false
  await expect(f.writer.dispatch(f.session, ToolCallId('revoked'), (state) => {
    if (!state.operations.includes('execute')) throw new Error('revoked')
    return state
  }, async () => { submitted = true })).rejects.toThrow('revoked')
  expect(submitted).toBe(false)
})

portableTest('keeps a second execution or recovery out until the first execution lease settles', async () => {
  const f = await authorityFixture()
  const started = Promise.withResolvers<true>()
  const finish = Promise.withResolvers<true>()
  onTestFinished(() => { finish.resolve(true) })
  const first = f.writer.exclusive(f.session, async () => { started.resolve(true); await finish.promise })
  await started.promise
  await expect(f.other.exclusive(f.session, async () => {})).rejects.toThrow('timed out waiting for the writer lock')
  finish.resolve(true)
  await first
  await expect(f.other.exclusive(f.session, async () => 'recovered')).resolves.toBe('recovered')
})
