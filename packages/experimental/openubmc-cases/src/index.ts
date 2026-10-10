/** Read-only native openUBMC Case observations and command. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { OpenUbmcCaseId, OpenUbmcCaseObservation, OpenUbmcCasesState, OpenUbmcCasesView } from './types.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'openubmc-cases'
/** Existing registries used for observation and user queries. */
export const inject = ['sessionProjections', 'commands']

/** Selects the trusted MCP server that owns Case observations. */
export interface Config {
  /** Exact MCP namespace; the corresponding client must enable structuredContentInMeta. */
  serverName: string
}
/** Required source selection; no public tool-name parsing. */
export const Config: z<Config> = z.object({ serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/) })

const caseIdSchema = schema.string().min(1).transform(value => brandString<OpenUbmcCaseId>(value))
const observationSchema: schema.ZodType<OpenUbmcCaseObservation> = schema.object({
  caseId: caseIdSchema, revision: schema.number().int().nonnegative().nullable(), status: schema.string().min(1),
  toolName: schema.string().min(1), isError: schema.boolean(), inherited: schema.boolean(),
  observedAtSeq: schema.number().int().nonnegative().transform(SessionSeq),
  evidenceRefs: schema.array(schema.json()), nextActions: schema.array(schema.string()),
})
const viewSchema: schema.ZodType<OpenUbmcCasesView> = schema.object({
  cases: schema.array(observationSchema), failure: schema.string().nullable(),
})
const metadataSchema = schema.object({ mcp: schema.object({
  serverName: schema.string(), toolName: schema.string().min(1),
  structuredContent: schema.record(schema.string(), schema.json()).optional(),
}) })
const envelopeSchema = schema.object({
  case_id: caseIdSchema, revision: schema.number().int().nonnegative().nullable().default(null), status: schema.string().min(1),
  evidence_refs: schema.array(schema.json()).default([]), next_actions: schema.array(schema.string()).default([]),
})

/**
 * Create a rebuildable Case projection for one configured Runtime server.
 * @param serverName - trusted bridge namespace whose structured results are observed.
 * @returns pure fold with a checkpoint schema and a native client view.
 */
export function createCasesProjection(serverName: string): Omit<ProjectionDefinition<'openubmc/cases'>, 'wire'> & {
  wire: NonNullable<ProjectionDefinition<'openubmc/cases'>['wire']>
} {
  const stateSchema: schema.ZodType<OpenUbmcCasesState> = schema.object({
    serverName: schema.literal(serverName),
    inheritedEventCount: schema.number().int().nonnegative().transform(SessionLogOffset), view: viewSchema,
  })
  return {
    key: 'openubmc/cases', stateSchema, stateVersion: 1,
    init: (_header, inheritedEventCount) => ({ serverName, inheritedEventCount, view: { cases: [], failure: null } }),
    apply(state, event) {
      if (event.type !== 'tool/result') return state
      const metadata = metadataSchema.safeParse(event.data.meta)
      if (!metadata.success || metadata.data.mcp.serverName !== serverName) return state
      const structured = metadata.data.mcp.structuredContent
      if (structured === undefined) return state
      const envelope = Object.hasOwn(structured, 'agent_envelope') ? structured.agent_envelope : structured
      if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) return state
      if (envelope.case_id === undefined || envelope.case_id === '') return state
      const parsed = envelopeSchema.safeParse(envelope)
      if (!parsed.success) return { ...state, view: { ...state.view, failure: `Invalid openUBMC Case metadata at event ${event.seq}.` } }
      const value = parsed.data
      const observation: OpenUbmcCaseObservation = {
        caseId: value.case_id, revision: value.revision, status: value.status,
        toolName: metadata.data.mcp.toolName, isError: event.data.message.isError === true,
        inherited: event.seq < state.inheritedEventCount, observedAtSeq: event.seq,
        evidenceRefs: value.evidence_refs, nextActions: value.next_actions,
      }
      return { ...state, view: { cases: [...state.view.cases.filter(c => c.caseId !== observation.caseId), observation], failure: null } }
    },
    wire: { viewSchema, view: state => state.view },
  }
}

/**
 * Register the Case projection and an attachment-free, read-only /case command.
 * @param ctx - context with the projection and native command registries.
 * @param config - exact Runtime source selection.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.sessionProjections.register(createCasesProjection(config.serverName))
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-cases'), name: 'case',
    description: 'View observed openUBMC Cases', input: { hint: '[case-id]' },
    handler: (invocation) => {
      const query = invocation.rawInput.trim()
      const state = ctx.sessionProjections.stateOf(invocation.agent.session, 'openubmc/cases')
      if (state === undefined) throw new Error('openUBMC Case projection is not registered')
      const observed = state.view.cases.filter(c => query === '' || c.caseId === query)
      if (query !== '' && observed.length === 0) return { kind: 'error', text: `No observed openUBMC Case matches ${query}. Usage: /case [case-id]` }
      const lines = observed.flatMap(c => [
        `${c.caseId} | ${c.status} | revision ${c.revision ?? 'unknown'} | ${c.isError ? 'failed' : 'succeeded'} | ${c.inherited ? 'inherited observation' : 'session observation'}`,
        `Tool: ${c.toolName}`,
        `Evidence: ${JSON.stringify(c.evidenceRefs)}`,
        `Next actions: ${c.nextActions.join(', ') || 'none reported'}`,
      ])
      return {
        kind: state.view.failure === null ? 'success' : 'error',
        text: [...(lines.length === 0 ? ['No openUBMC Case has been observed in this session.'] : ['Observed openUBMC Cases (last tool results; Runtime state may have changed).', ...lines]),
          ...state.view.failure === null ? [] : [state.view.failure],
        ].join('\n'),
      }
    },
  })
}
