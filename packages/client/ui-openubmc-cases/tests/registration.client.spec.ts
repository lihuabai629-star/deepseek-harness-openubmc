// @vitest-environment jsdom
import { expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { AgentControlsInjected } from '../src/client/OpenUbmcAgentPanel.tsx'
import { apply, inject } from '../src/client/index.ts'

it('owns definitions, translations and the renderer while native commands retain Session identity and failure', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(async () => { vi.unstubAllGlobals(); await runtime.dispose() })
  vi.stubGlobal('__DSH_OPENUBMC_CASES_CONFIG__', { serverName: 'runtime' })
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  runtime.ctx.provide('locale', locale)
  const conversation = new UiConversation(runtime.ctx, runtime.sessions)
  const execute = vi.fn(async () => ({ ok: true as const, value: { result: { kind: 'success' as const, text: 'settled' } } }))
  runtime.remote.provideNamespaces({ commands: { execute } })
  const fiber = runtime.ctx.plugin({ apply, inject })
  await fiber.await()
  expect(conversation.events.entries()).toHaveLength(2)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const declare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  declare()
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const redeclare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(2)
  const entry = runtime.slots.entries('conversation.chat.node').find(item => item.options.key === 'openubmc-agent')!
  const controls = entry.inject!(SessionId('current-session') as never) as object as AgentControlsInjected
  await controls.submitCommand('/target-action {}')
  expect(execute).toHaveBeenCalledWith(SessionId('current-session'), '/target-action {}', [])
  execute.mockResolvedValueOnce({ ok: true, value: { result: { kind: 'error', text: 'Gate changed' } } } as never)
  await expect(controls.submitCommand('/target-action {}')).rejects.toThrow('Gate changed')
  execute.mockResolvedValueOnce({ ok: false } as never)
  await expect(controls.submitCommand('/target-action {}')).rejects.toThrow('unavailable')
  await fiber.dispose()
  expect(conversation.events.entries()).toHaveLength(0)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  redeclare()
})
