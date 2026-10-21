/** Model guidance for native openUBMC tasks and recorded execution state. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { OpenUbmcRuntimeState } from './types.ts'

/** Task guidance shared by fresh and resumed openUBMC conversations. */
export const openUbmcWorkflowGuidance = `openUBMC work uses the available observe and execute tools. Runtime owns Runs, Gates, Incidents, evidence and device effects. Keep the same Run and returned bindings across stage changes and recovery.

Before the first workflow action and each stage change, load the current owner's instructions through the available skill catalog. Match the stage: live diagnosis or post-change verification, source development, test design, build, live file replacement, or firmware upgrade. Use the catalog's exact skill name and resource paths. A specified mechanical edit can follow the ordinary edit and focused-check path. If a required skill is unavailable, report that gap and continue independent authorized work.

Use observe for the exact read-only evidence needed for the answer. Start a Run only for the user's workflow, then follow its returned next_action. A default diagnosis-only start is read-only; a different entry operation or delivery needs its applicable execution permission. Copy reusable action bindings exactly. A null next_action requires missing external work or input; do not invent a continuation. A response_required Gate requests actual work and evidence; it does not by itself require human approval. Read gate.input_schema, perform the current stage, and use execute kind=respond with the returned Gate binding and submission_id. Submit only facts established by tool results, source changes, checks or artifacts. Use partial when the current schema permits it and work remains; otherwise record failed or cancelled as appropriate. Never invent evidence, a successful check, a root cause or Gate acceptance. If progress.status is no_progress on the same Gate, do the missing work and respond; repeating resume cannot supply evidence.

Carry the user's existing target and operation authorization. Follow current execution permissions. A start that needs new authority asks through native authorization; do not create a second approval request. Ask through the available native user-interaction tool only for necessary missing information or a material user decision. Do not ask the user to fill protocol JSON or approve each evidence Gate. Tool denials are not grants; never supply Runtime-owned authority or identity fields yourself.

For an explicit request to keep working, use the available native Goal tools and reuse an active Goal. Continue authorized work and stage handoffs until delivery or a real blocker. Mark completion only after the requested work and verification finish. Preserve the same Run when continuing after interruption. A pending call, lost reply, timeout or cancellation does not establish device rollback: observe recorded facts and reconcile the same Run before another effect. An unacknowledged start requires recovery with its original operation identity. Report the practical result and remaining gaps concisely; keep protocol details and evidence available on demand.`

/**
 * Summarize recorded authority and workflow conditions without copying unbounded evidence.
 * @param state - Authoritative Session projection rebuilt from recorded calls and settlements.
 * @returns Fixed-field context for the next model request.
 */
export function renderOpenUbmcRuntimeContext(state: OpenUbmcRuntimeState): string {
  const pending = Object.keys(state.pendingCalls).length
  const uncertain = Object.keys(state.uncertainCalls).length
  const runs = Object.values(state.runs).filter(run => run !== undefined)
  const gates = runs.filter(run => run.gate != null).length
  const incidents = runs.filter(run => run.incident != null).length
  const lines = [
    `openUBMC recorded Session state: execute authorization ${state.operations.includes('execute') || state.scopes.length > 0 ? 'granted within its recorded scope' : 'absent for additional effects'}; pending calls ${pending}; uncertain calls ${uncertain}; owned Runs ${runs.length}; open Gates ${gates}; Incidents ${incidents}.`,
  ]
  if (pending > 0 || uncertain > 0) {
    lines.push('Resolve the unsettled operation before another effect. Keep its Run and original operation identity; an unacknowledged start needs the native recovery path, while a known Run uses reconciliation.')
  }
  if (incidents > 0) lines.push('Read the recorded Incident and follow its recovery action before continuing the same Run.')
  if (gates > 0) lines.push('Read the latest returned Gate schema and bindings. Load its stage owner, complete the work, then submit evidence through respond; a Gate alone does not require a user decision.')
  return lines.join('\n')
}

/**
 * Register reversible workflow instructions and durable runtime-context snapshots.
 * @param ctx - Owning plugin context with prompt and Session projection services.
 */
export function installOpenUbmcGuidance(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'openubmc:workflow', order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
    text: openUbmcWorkflowGuidance,
  })
  ctx.systemPrompt.context({
    name: 'openubmc:runtime', order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
    text: (context) => {
      if (context.agent === undefined) return ''
      const state = ctx.sessionProjections.stateOf(context.agent.session, 'openubmc/runtime')
      if (state === undefined) throw new Error('openUBMC Session authority is unavailable.')
      return renderOpenUbmcRuntimeContext(state)
    },
  })
}
