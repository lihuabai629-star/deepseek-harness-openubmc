/** Optional Web presentation of native Agent results and historical Cases. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { Config } from '../config.ts'
import { OpenUbmcCasePanel } from './OpenUbmcCasePanel.tsx'
import { createAgentDefinition } from './agent-definition.ts'
import { OpenUbmcAgentPanel } from './OpenUbmcAgentPanel.tsx'
import type { AgentControlsInjected } from './OpenUbmcAgentPanel.tsx'
import { createCasesDefinition } from './definition.ts'
import { en, NS, zh, type OpenUbmcCasesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { openubmcCases: OpenUbmcCasesKey }
}
/** Required presentation registries. */
export const inject = ['uiConversation', 'slots', 'locale', 'remote', 'remote.commands']
/** Register localized durable Run, receipt and historical Case cards. @param ctx - Client composition. */
export function apply(ctx: Context): void {
  const config = Config((globalThis as { __DSH_OPENUBMC_CASES_CONFIG__?: Config }).__DSH_OPENUBMC_CASES_CONFIG__)
  ctx.effect(() => ctx.uiConversation.events.register(createCasesDefinition(config.serverName)), 'openubmc-cases: conversation definition')
  ctx.effect(() => ctx.uiConversation.events.register(createAgentDefinition(config.serverName)), 'openubmc-agent: conversation definition')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'openubmc-agent', locale: NS,
    inject: (sessionId): AgentControlsInjected => ({
      submitCommand: async (line) => {
        const result = await ctx.remote.commands.execute(sessionId, line, [])
        if (!result.ok || result.value === undefined) throw new Error('The native Run command is unavailable.')
        if (result.value.result.kind === 'error') throw new Error(result.value.result.text)
      },
    }),
  }, OpenUbmcAgentPanel))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openubmc-cases: dictionaries')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'openubmc-case', locale: NS }, OpenUbmcCasePanel))
}
