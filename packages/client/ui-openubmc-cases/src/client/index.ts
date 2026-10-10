/** Optional Web Case cards with native read-only inspection actions. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { Config } from '../config.ts'
import { OpenUbmcCasePanel } from './OpenUbmcCasePanel.tsx'
import { createCasesDefinition } from './definition.ts'
import { en, NS, zh, type OpenUbmcCasesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { openubmcCases: OpenUbmcCasesKey }
}
/** Native read-only commands resolved for the rendered Session. */
export interface CaseInspectionActions {
  /** Refresh current Case facts without model inference. @returns an error or null on success. */
  refreshCase(this: void): Promise<string | null>
  /** Read one bounded referenced evidence slice. @param evidenceId - Runtime evidence reference. @returns an error or null on success. */
  readEvidence(this: void, evidenceId: string): Promise<string | null>
}
/** Required registries and the generated command Remote. */
export const inject = ['uiConversation', 'slots', 'locale', 'remote', 'remote.commands']
/** Register locale, durable cards and Session-scoped native actions. @param ctx - Client composition. */
export function apply(ctx: Context): void {
  const config = Config((globalThis as { __DSH_OPENUBMC_CASES_CONFIG__?: Config }).__DSH_OPENUBMC_CASES_CONFIG__)
  ctx.effect(() => ctx.uiConversation.events.register(createCasesDefinition(config.serverName)), 'openubmc-cases: conversation definition')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openubmc-cases: dictionaries')
  const execute = async (sessionId: SessionId, line: string): Promise<string | null> => {
    const response = await ctx.remote.commands.execute(sessionId, line, [])
    if (!response.ok) return response.error.message
    if (response.value === undefined) return ctx.locale.bind(NS)('unavailable')
    return response.value.result.kind === 'error' ? response.value.result.text : null
  }
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'openubmc-case', locale: NS,
    inject: (sessionId: SessionId): CaseInspectionActions => ({ refreshCase: () => execute(sessionId, '/case-refresh'),
      readEvidence: evidenceId => execute(sessionId, `/evidence ${evidenceId}`) }),
  }, OpenUbmcCasePanel))
}
