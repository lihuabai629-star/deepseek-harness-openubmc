// @vitest-environment jsdom
import { expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, type CaseInspectionActions } from '../src/client/index.ts'

it('owns definitions, translations and the renderer while native commands retain Session identity and failure', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(async () => { vi.unstubAllGlobals(); await runtime.dispose() })
  vi.stubGlobal('__DSH_OPENUBMC_CASES_CONFIG__', { serverName: 'runtime' })
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  runtime.ctx.provide('locale', locale)
  const conversation = new UiConversation(runtime.ctx, runtime.sessions)
  let response: object = { ok: true, value: { result: { kind: 'text', text: 'read' } } }
  const execute = vi.fn(async () => response)
  runtime.remote.provideNamespaces({ commands: { execute } })
  const fiber = runtime.ctx.plugin({ apply, inject })
  await fiber.await()
  expect(conversation.events.entries()).toHaveLength(1)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const declare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  const entry = runtime.slots.entries('conversation.chat.node')[0]!
  const injected = entry.inject!('session-A' as never)
  const actions: CaseInspectionActions = { refreshCase: injected.refreshCase as CaseInspectionActions['refreshCase'], readEvidence: injected.readEvidence as CaseInspectionActions['readEvidence'] }
  expect(await actions.refreshCase()).toBeNull()
  expect(execute).toHaveBeenLastCalledWith('session-A', '/case-refresh', [])
  expect(await actions.readEvidence('evidence-1')).toBeNull()
  expect(execute).toHaveBeenLastCalledWith('session-A', '/evidence evidence-1', [])
  response = { ok: false, error: { message: 'Runtime unavailable' } }
  expect(await actions.refreshCase()).toBe('Runtime unavailable')
  response = { ok: true }
  expect(await actions.refreshCase()).toContain('unavailable')
  response = { ok: true, value: { result: { kind: 'error', text: 'Case mismatch' } } }
  expect(await actions.refreshCase()).toBe('Case mismatch')
  declare()
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  const redeclare = runtime.slots.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } } as never, () => null)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(1)
  await fiber.dispose()
  expect(conversation.events.entries()).toHaveLength(0)
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  redeclare()
})
