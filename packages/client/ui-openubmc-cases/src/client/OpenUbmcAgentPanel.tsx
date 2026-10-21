/** Native Run and observation receipt presentation. @module */
import { useState } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcRunId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { Button, DisclosureRow, IconChevronRightOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-runtime/types'
import type {} from './agent-definition.ts'
import { gateBinding, responseGate } from './agent-actions.ts'
import { OpenUbmcGateForm } from './OpenUbmcGateForm.tsx'
import css from './OpenUbmcCasePanel.module.css'

/** Native human command capability bound to this card's Session. */
export interface AgentControlsInjected { submitCommand(this: void, line: string): Promise<void> }

/**
 * Render recorded results and explicit current-session continuation controls.
 * @param props - Durable Conversation node, projection hook and localized copy.
 * @returns the expandable Run or observation receipt.
 */
export function OpenUbmcAgentPanel({ node, useProjection, submitCommand, t }: Pick<PropsRuntime<'conversation.chat.node', 'openubmc-agent'>, 'node' | 'useProjection'> & PropsLocale<'openubmcCases'> & InjectFace<AgentControlsInjected>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data } = node
  const view = useProjection('openubmc/cases')
  const inherited = node.anchorSeq < (view?.inheritedEventCount ?? 0)
  const latest = view?.agentResults?.find(item => item.id === data.id)
  const stale = latest !== undefined && latest.observedAtSeq !== node.anchorSeq
  const authority = useProjection('openubmc/runtime')
  const current = data.kind === 'run' && latest?.observedAtSeq === node.anchorSeq && !inherited && !stale
  const gate = responseGate(data.document.gate)
  const terminal = ['completed', 'failed', 'cancelled'].includes(data.status)
  const executable = data.kind === 'run' && authority?.executableRunIds.includes(brandString<OpenUbmcRunId>(data.id)) === true
  const ready = current && executable && authority.pending === 0 && authority.uncertain === 0 && !busy
  const send = async (line: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try { await submitCommand(line) } catch (_failure) {
      setError(t('submitFailed'))
    } finally { setBusy(false) }
  }
  const action = (value: Record<string, JsonValue>): Promise<void> => send(`/target-action ${JSON.stringify(value)}`)
  const next = data.document.next_action
  const resume = next !== null && typeof next === 'object' && !Array.isArray(next) && next.kind === 'resume' && next.run_id === data.id ? next : null
  const incident = data.document.incident
  const cancelIncident = incident !== null && typeof incident === 'object' && !Array.isArray(incident)
    && typeof incident.incident_id === 'string' && Array.isArray(incident.allowed_commands) && incident.allowed_commands.includes('cancel')
    ? incident.incident_id : null
  const reconcileIncident = incident !== null && typeof incident === 'object' && !Array.isArray(incident)
    && Array.isArray(incident.allowed_commands) && incident.allowed_commands.includes('reconcile')
  const warning = ['incident', 'waiting_response', 'cancelled', 'incomplete'].includes(data.status)
  return <section className={css.root} data-openubmc-agent data-run-id={data.id}>
    <DisclosureRow icon={<IconChevronRightOutlineRegular />} title={`${t(data.kind === 'run' ? 'runTitle' : 'receiptTitle')} · ${data.id}`}
      open={open} onToggle={() => { setOpen(value => !value) }} expandable expandOnRowClick>
      <div className={css.header}><StateDot
        state={data.isError || data.status === 'failed' ? 'error' : warning ? 'warning' : data.status === 'running' ? 'ongoing' : 'done'} />
      <span>{data.status}</span></div>
      <div className={css.meta}>
        <span>{inherited ? t('inherited') : t('current')}</span><span>{stale ? t('stale') : t('recorded')}</span>
        <a href={`#openubmc-evidence-${node.key}`}>{t('evidence')}</a>
      </div>
      {current && authority !== undefined ? <div className={css.controls}>
        <Button disabled={busy || authority.pending > 0} onClick={() => { void send(`/target-authorize ${authority.authorized ? 'revoke' : 'execute'}`) }}>
          {t(authority.authorized ? 'revokeExecution' : 'authorizeExecution')}
        </Button>
        {(authority.pending > 0 || authority.uncertain > 0 || reconcileIncident && !terminal) ? <Button
          disabled={busy || !executable}
          onClick={() => { void action({ kind: 'control', command: 'reconcile', run_id: data.id }) }}>{t('reconcileRun')}</Button> : null}
        {resume === null || terminal ? null : <Button disabled={!ready} onClick={() => { void action(resume) }}>{t('resumeRun')}</Button>}
        {terminal || gate === null && cancelIncident === null ? null : <Button disabled={!ready} onClick={() => {
          void action({ kind: 'control', command: 'cancel', run_id: data.id,
            ...(cancelIncident === null && gate !== null ? gateBinding(gate) : { incident_id: cancelIncident }) })
        }}>{t('cancelRun')}</Button>}
      </div> : null}
      {current && authority !== undefined && !terminal && gate !== null ? <OpenUbmcGateForm key={`${gate.gate_id}:${gate.gate_version}:${gate.schema_digest}`} gate={gate} disabled={!ready} t={t}
        submit={response => action({ kind: 'respond', run_id: data.id, ...gateBinding(gate), response })} /> : null}
      {error === null ? null : <span role="alert" className={css.bad}>{error}</span>}
      {(['gate', 'incident', 'outcome', 'facts', 'gaps', 'coverage', 'freshness',
        'results', 'evidence', 'progress', 'next_action'] as const).map(key =>
        data.document[key] == null ? null : <div className={css.section} key={key}>
          <span className={css.label}>{t(key)}</span><pre className={css.values}>{JSON.stringify(data.document[key], null, 2)}</pre>
        </div>)}
      <div className={css.section} id={`openubmc-evidence-${node.key}`}><span className={css.label}>{t('diagnosticReceipt')}</span>
        <pre className={css.values}>{JSON.stringify(data.document.diagnostic_receipt ?? data.document.evidence ?? [], null, 2)}</pre></div>
      <div className={css.section}><span className={css.label}>{t('rawResult')}</span><pre className={css.values}>{JSON.stringify(data.document, null, 2)}</pre></div>
    </DisclosureRow>
  </section>
}
