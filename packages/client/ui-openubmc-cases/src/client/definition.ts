/** Validated persisted Runtime observations for the Conversation registry. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcCaseId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import type { ConversationMatch, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-cases/types'

/** One historical observation with independently reported Case and operation status. */
export interface OpenUbmcCaseChatData {
  readonly caseId: OpenUbmcCaseId
  readonly revision: number
  readonly status: string | null
  readonly operationStatus: string
  readonly toolName: string
  readonly isError: boolean
  readonly evidence: readonly JsonValue[]
  readonly artifacts: readonly JsonValue[]
  readonly phases: readonly JsonValue[]
  readonly nextActions: readonly string[]
  readonly evidenceBody: string | null
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Validated durable Runtime query or tool result. */
    'openubmc-case': OpenUbmcCaseChatData
  }
}
interface CaseState { readonly value: OpenUbmcCaseChatData }
const contextSchema = 'openubmc.target-runtime.v1/context-runtime'
const metadataSchema = z.object({
  mcp: z.object({ serverName: z.string(), toolName: z.string(), structuredContent: z.record(z.string(), z.json()) }) })
const envelopeSchema = z.object({ schema: z.literal('openubmc.target-runtime.v1/agent-envelope'), case_id: z.string().min(1), revision: z.number().int().nonnegative(),
  status: z.string().min(1), operation: z.object({ name: z.string().min(1), status: z.string().min(1) }),
  evidence_refs: z.array(z.json()), next_actions: z.array(z.string()),
  capsule: z.json().optional(),
}).refine(value => value.status === value.operation.status)
const reportSchema = z.object({
  schema: z.literal(contextSchema), case_id: z.string().min(1), revision: z.number().int().nonnegative(),
  status: z.string().min(1),
  phase_records: z.array(z.json()).optional(), artifact_revisions: z.array(z.json()).optional(),
  evidence_refs: z.array(z.json()), next_actions: z.array(z.string()) })
const capsuleSchema = z.object({ schema: z.literal(`${contextSchema}/capsule`), case_id: z.string().min(1), case_revision: z.number().int().nonnegative(),
  status: z.string().min(1), next_actions: z.array(z.string()), artifact_revisions: z.array(z.json()).optional() })
const evidenceSchema = z.object({ schema: z.literal(`${contextSchema}/evidence-read`), case_id: z.string(), body: z.string() })

/** Admit only matching Case identities/revisions from the configured trusted source. */
function parse(event: ConversationMatch['event'], serverName: string): OpenUbmcCaseChatData | undefined {
  if (event.type !== 'tool/result' && event.type !== 'openubmc/inspection') return undefined
  const metadata = metadataSchema.safeParse(event.data.meta)
  if (!metadata.success || metadata.data.mcp.serverName !== serverName) return undefined
  const { structuredContent: structured, toolName } = metadata.data.mcp
  const parsed = envelopeSchema.safeParse(Object.hasOwn(structured, 'agent_envelope') ? structured.agent_envelope : structured)
  if (!parsed.success || parsed.data.operation.name !== toolName) return undefined
  const envelope = parsed.data
  const report = reportSchema.safeParse(structured)
  const capsule = envelope.capsule === undefined ? undefined : capsuleSchema.safeParse(envelope.capsule)
  if (structured.schema === contextSchema && !report.success || capsule !== undefined && !capsule.success) return undefined
  if (report.success && (report.data.case_id !== envelope.case_id || report.data.revision !== envelope.revision)
    || capsule?.success && (capsule.data.case_id !== envelope.case_id || capsule.data.case_revision !== envelope.revision)) return undefined
  const evidence = evidenceSchema.safeParse(structured)
  if (structured.schema === `${contextSchema}/evidence-read` && (!evidence.success || evidence.data.case_id !== envelope.case_id)) return undefined
  return { caseId: brandString<OpenUbmcCaseId>(envelope.case_id), revision: envelope.revision,
    status: report.success ? report.data.status : capsule?.success ? capsule.data.status : null,
    operationStatus: envelope.status, toolName, isError: event.data.message.isError === true,
    evidence: report.success ? report.data.evidence_refs : envelope.evidence_refs,
    artifacts: report.success && report.data.artifact_revisions !== undefined ? report.data.artifact_revisions
      : capsule?.success ? capsule.data.artifact_revisions ?? [] : [],
    phases: report.success ? report.data.phase_records ?? [] : [],
    nextActions: report.success ? report.data.next_actions : envelope.next_actions,
    evidenceBody: evidence.success ? evidence.data.body : null }
}

/**
 * Build a source-specific durable Conversation definition.
 * @param serverName - trusted MCP source.
 * @returns the registered node definition.
 */
export function createCasesDefinition(serverName: string): ConversationNodeDefinition<CaseState> {
  return { kind: 'openubmc-case', target: 'chat',
    match: event => parse(event, serverName) === undefined ? null : { id: String(event.seq), role: 'start' },
    start: (_context, match) => {
      const value = parse(match.event, serverName)
      if (value === undefined) throw new Error('Case node requires validated metadata')
      return { value }
    }, update: context => context.state,
    buildViewNode: (context): ChatConversationViewNode | null => {
      if (context.start === undefined || context.state === undefined) return null
      return { key: context.key, kind: 'openubmc-case', id: context.id, target: 'chat', anchorSeq: context.start.event.seq,
        location: context.start.location, visibility: 'visible', data: context.state.value }
    },
  }
}
