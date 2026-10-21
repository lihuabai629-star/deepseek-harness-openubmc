/** Read-only native openUBMC Case observations and command. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import { SessionLogOffset, SessionSeq, type Session } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { runTurnSchema, observationReceiptSchema } from './agent.ts'
import type { OpenUbmcAgentResultId, OpenUbmcCaseId, OpenUbmcCaseObservation, OpenUbmcCasesState, OpenUbmcCasesView } from './types.ts'
export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'openubmc-cases'
/** Existing registries used for observation and user queries. */
export const inject = ['sessionProjections', 'commands']

/** Selects the trusted metadata source in the durable Session log. */
export interface Config {
  /** Exact MCP namespace; live connectivity is not required for historical queries. */
  serverName: string
}
/** Required source selection; no public tool-name parsing. */
export const Config: z<Config> = z.object({ serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/) })

const caseIdSchema = schema.string().min(1).transform(value => brandString<OpenUbmcCaseId>(value))
const observationSchema: schema.ZodType<OpenUbmcCaseObservation> = schema.object({
  caseId: caseIdSchema, revision: schema.number().int().nonnegative(), status: schema.string().min(1).nullable(),
  operationStatus: schema.string().min(1),
  toolName: schema.string().min(1), isError: schema.boolean(), inherited: schema.boolean(),
  observedAtSeq: schema.number().int().nonnegative().transform(SessionSeq),
  phaseRecords: schema.array(schema.json()).optional(), artifactRevisions: schema.array(schema.json()).optional(),
  evidenceRefs: schema.array(schema.json()), nextActions: schema.array(schema.string()),
})
const viewSchema: schema.ZodType<OpenUbmcCasesView> = schema.object({
  inheritedEventCount: schema.number().int().nonnegative().transform(SessionLogOffset).optional(),
  agentResults: schema.array(schema.object({ id: schema.string().transform(value => brandString<OpenUbmcAgentResultId>(value)), kind: schema.enum(['run', 'observation']),
    document: schema.record(schema.string(), schema.json()), isError: schema.boolean(), inherited: schema.boolean(),
    observedAtSeq: schema.number().int().nonnegative().transform(SessionSeq) })).optional(),
  cases: schema.array(observationSchema), failure: schema.string().nullable(),
})
const metadataSchema = schema.object({ mcp: schema.object({
  serverName: schema.string(), toolName: schema.string().min(1),
  structuredContent: schema.record(schema.string(), schema.json()).optional(),
}) })
const agentSchema = 'openubmc.target-runtime.v1/agent-envelope'
const contextSchema = 'openubmc.target-runtime.v1/context-runtime'
const discriminatorSchema = schema.object({ schema: schema.literal(agentSchema) })
const envelopeSchema = schema.object({
  schema: schema.literal(agentSchema), case_id: schema.string(),
  revision: schema.number().int().nonnegative(), status: schema.string().min(1),
  operation: schema.object({ name: schema.string().min(1), status: schema.string().min(1) }),
  evidence_refs: schema.array(schema.json()), next_actions: schema.array(schema.string()),
  phase_records: schema.array(schema.json()).optional(), artifact_revisions: schema.array(schema.json()).optional(),
  capsule: schema.json().optional(),
}).refine(value => value.status === value.operation.status)
const caseReportSchema = schema.union([
  schema.object({
    schema: schema.literal(contextSchema), case_id: caseIdSchema, revision: schema.number().int().nonnegative(),
    status: schema.string().min(1), evidence_refs: schema.array(schema.json()), next_actions: schema.array(schema.string()),
    phase_records: schema.array(schema.json()).optional(), artifact_revisions: schema.array(schema.json()).optional(),
  }).transform(value => ({
    caseId: value.case_id, revision: value.revision, status: value.status,
    evidenceRefs: value.evidence_refs, nextActions: value.next_actions,
    ...(value.phase_records === undefined ? {}
      : { phaseRecords: value.phase_records }),
    ...(value.artifact_revisions === undefined ? {}
      : { artifactRevisions: value.artifact_revisions }),
  })),
  schema.object({
    schema: schema.literal(`${contextSchema}/capsule`), case_id: caseIdSchema, case_revision: schema.number().int().nonnegative(),
    status: schema.string().min(1), next_actions: schema.array(schema.string()),
    phase_records: schema.array(schema.json()).optional(), artifact_revisions: schema.array(schema.json()).optional(),
  }).transform(value => ({
    caseId: value.case_id, revision: value.case_revision, status: value.status,
    evidenceRefs: undefined, nextActions: value.next_actions,
    phaseRecords: value.phase_records, artifactRevisions: value.artifact_revisions,
  })),
]).optional()

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
    key: 'openubmc/cases', stateSchema, stateVersion: 2,
    init: (_header, inheritedEventCount) => ({ serverName, inheritedEventCount, view: { cases: [], failure: null } }),
    apply(state, event) {
      if (event.type !== 'tool/result' && event.type !== 'openubmc/inspection') return state
      const metadata = metadataSchema.safeParse(event.data.meta)
      if (!metadata.success || metadata.data.mcp.serverName !== serverName) return state
      const structured = metadata.data.mcp.structuredContent
      if (structured === undefined) return state
      const agent = metadata.data.mcp.toolName === 'execute' ? runTurnSchema.safeParse(structured)
        : metadata.data.mcp.toolName === 'observe' ? observationReceiptSchema.safeParse(structured) : undefined
      if (agent?.success) {
        const kind = metadata.data.mcp.toolName === 'execute' ? 'run' : 'observation'
        const id = kind === 'run' ? structured.run_id : structured.receipt_id
        if (typeof id !== 'string') return state
        return { ...state, view: { ...state.view, failure: null, agentResults: [
          ...(state.view.agentResults ?? []).filter(item => item.id !== id),
          { id: brandString<OpenUbmcAgentResultId>(id), kind, document: structured, isError: event.data.message.isError === true,
            inherited: event.seq < state.inheritedEventCount, observedAtSeq: event.seq },
        ] } }
      }
      const envelope = Object.hasOwn(structured, 'agent_envelope') ? structured.agent_envelope : structured
      if (!discriminatorSchema.safeParse(envelope).success) return state
      const invalid = () => ({ ...state, view: { ...state.view, failure: `Invalid openUBMC Case metadata at event ${event.seq}.` } })
      const parsed = envelopeSchema.safeParse(envelope)
      if (!parsed.success) return invalid()
      const value = parsed.data
      if (value.case_id === '') return state
      const report = caseReportSchema.safeParse(structured.schema === contextSchema ? structured : value.capsule)
      if (!report.success) return invalid()
      const caseReport = report.data
      const capsule = caseReportSchema.safeParse(value.capsule)
      if (!capsule.success || capsule.data !== undefined
        && (capsule.data.caseId !== value.case_id || capsule.data.revision !== value.revision)) return invalid()
      const artifactRevisions = caseReport?.artifactRevisions ?? capsule.data?.artifactRevisions
      if (value.operation.name !== metadata.data.mcp.toolName
        || caseReport !== undefined && (caseReport.caseId !== value.case_id || caseReport.revision !== value.revision)) return invalid()
      const previous = state.view.cases.find(c => c.caseId === value.case_id)
      const isError = event.data.message.isError === true
      const reportsRecovery = isError || !['runtime_status', 'evidence_read'].includes(value.operation.name)
      const observation: OpenUbmcCaseObservation = {
        caseId: brandString<OpenUbmcCaseId>(value.case_id), revision: value.revision,
        status: caseReport?.status ?? previous?.status ?? null,
        operationStatus: value.status, toolName: metadata.data.mcp.toolName, isError,
        inherited: event.seq < state.inheritedEventCount || previous?.inherited === true && caseReport?.evidenceRefs === undefined,
        observedAtSeq: event.seq,
        evidenceRefs: caseReport?.evidenceRefs
          ?? (reportsRecovery && value.evidence_refs.length > 0 ? value.evidence_refs : previous?.evidenceRefs ?? []),
        ...((caseReport?.phaseRecords ?? previous?.phaseRecords) === undefined ? {}
          : { phaseRecords: caseReport?.phaseRecords ?? previous?.phaseRecords }),
        ...((artifactRevisions ?? previous?.artifactRevisions) === undefined ? {}
          : { artifactRevisions: artifactRevisions ?? previous?.artifactRevisions }),
        nextActions: caseReport?.nextActions ?? (reportsRecovery ? value.next_actions : previous?.nextActions ?? []),
      }
      return { ...state, view: { ...state.view,
        cases: [...state.view.cases.filter(c => c.caseId !== observation.caseId), observation], failure: null } }
    },
    wire: { viewSchema, view: state => ({ ...state.view, inheritedEventCount: state.inheritedEventCount }) },
  }
}

/**
 * Register the Case projection and an attachment-free, read-only /case command.
 * @param ctx - context with the projection and native command registries.
 * @param config - exact Runtime source selection.
 */
export function apply(ctx: Context, config: Config): void {
  installCaseQueries(ctx, config)
}

/**
 * Install historical queries with optional provider-owned Run observations.
 * @param ctx - Context with command and projection registries.
 * @param config - Trusted Runtime namespace.
 * @param readRuns - Portable provider's latest recorded Turns, including native command results.
 */
export function installCaseQueries(ctx: Context, config: Config,
  readRuns?: (session: Session) => readonly Record<string, JsonValue>[]): void {
  ctx.sessionProjections.register(createCasesProjection(config.serverName))
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-experimental-openubmc-cases/run'), name: 'run',
    description: 'View recorded openUBMC Runs and observation receipts', input: { hint: '[run-or-receipt-id]' },
    handler: (invocation) => {
      const state = ctx.sessionProjections.stateOf(invocation.agent.session, 'openubmc/cases')
      if (state === undefined) throw new Error('openUBMC observation projection is not registered')
      const query = invocation.rawInput.trim()
      const portable = readRuns?.(invocation.agent.session) ?? []
      const results = (state.view.agentResults ?? []).filter(item => (query === '' || item.id === query)
        && !portable.some(run => run.run_id === item.id))
      const lines = [...results.map(item =>
        `${item.inherited ? 'Inherited' : 'Session'} observation at event ${item.observedAtSeq}: ${JSON.stringify(item.document)}`),
      ...portable.filter(run => query === '' || run.run_id === query).map(run => `Session observation: ${JSON.stringify(run)}`)]
      return { kind: query !== '' && lines.length === 0 ? 'error' : 'success',
        text: lines.length === 0 ? 'No matching openUBMC Run or receipt has been observed.' : lines.join('\n') }
    },
  })
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
        `${c.caseId} | Case status ${c.status ?? 'unreported'} | revision ${c.revision} | operation ${c.operationStatus} | ${c.isError ? 'failed' : 'succeeded'} | ${c.inherited ? 'inherited observation' : 'session observation'}`,
        `Tool: ${c.toolName}`,
        `Evidence: ${JSON.stringify(c.evidenceRefs)}`,
        `Phases: ${JSON.stringify(c.phaseRecords ?? [])}`,
        `Artifacts: ${JSON.stringify(c.artifactRevisions ?? [])}`,
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
