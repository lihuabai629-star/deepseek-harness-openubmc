// @vitest-environment jsdom
import { expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

it('owns definitions, translations and the renderer while native commands retain Session identity and failure', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(async () => { vi.unstubAllGlobals(); await runtime.dispose() })
  vi.stubGlobal('__DSH_OPENUBMC_CASES_CONFIG__', { serverName: 'runtime' })
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  runtime.ctx.provide('locale', locale)
  const conversation = new UiConversation(runtime.ctx, runtime.sessions)
  const fiber = runtime.ctx.plugin({ apply, inject })
  await fiber.await()
  expect(conversation.events.entries()).toHaveLength(2)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const declare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  declare()
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const redeclare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(2)
  await fiber.dispose()
  expect(conversation.events.entries()).toHaveLength(0)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  redeclare()
})
