/** Conversation cards for native Agent gateway Turns and observation receipts. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcAgentResultId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import type { ConversationMatch, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Persisted gateway result, independent of live connectivity or execution grants. */
export interface OpenUbmcAgentChatData {
  id: OpenUbmcAgentResultId
  kind: 'run' | 'observation'
  status: string
  document: Record<string, JsonValue>
  isError: boolean
}
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap { 'openubmc-agent': OpenUbmcAgentChatData }
}
const metadataSchema = z.object({ mcp: z.object({ serverName: z.string(), toolName: z.enum(['observe', 'execute']), structuredContent: z.record(z.string(), z.json()) }) })
const gateway = 'openubmc.target-runtime.v1/agent-gateway-v1'
function parse(event: ConversationMatch['event'], serverName: string): OpenUbmcAgentChatData | undefined {
  if (event.type !== 'tool/result') return undefined
  const parsed = metadataSchema.safeParse(event.data.meta)
  if (!parsed.success || parsed.data.mcp.serverName !== serverName) return undefined
  const { toolName, structuredContent: document } = parsed.data.mcp
  const run = toolName === 'execute'
  const id = run ? document.run_id : document.receipt_id
  const status = run ? document.state : document.status
  if (document.schema !== `${gateway}/${run ? 'turn' : 'observation-receipt'}`
    || typeof id !== 'string' || id === '' || typeof status !== 'string') return undefined
  return { id: brandString<OpenUbmcAgentResultId>(id), status, kind: run ? 'run' : 'observation', document, isError: event.data.message.isError === true }
}
/**
 * Build a gateway Conversation definition from trusted result metadata.
 * @param serverName - Exact configured MCP namespace.
 * @returns a replayable Run/receipt card definition.
 */
export function createAgentDefinition(serverName: string): ConversationNodeDefinition<{ value: OpenUbmcAgentChatData }> {
  return { kind: 'openubmc-agent', target: 'chat',
    match: event => parse(event, serverName) === undefined ? null : { id: String(event.seq), role: 'start' },
    start: (_context, match) => {
      const value = parse(match.event, serverName)
      if (value === undefined) throw new Error('Agent node requires validated metadata')
      return { value }
    }, update: context => context.state,
    buildViewNode: (context): ChatConversationViewNode | null => {
      if (context.start === undefined || context.state === undefined) return null
      return { key: context.key, kind: 'openubmc-agent', id: context.id, target: 'chat', anchorSeq: context.start.event.seq,
        location: context.start.location, visibility: 'visible', data: context.state.value }
    },
  }
}
