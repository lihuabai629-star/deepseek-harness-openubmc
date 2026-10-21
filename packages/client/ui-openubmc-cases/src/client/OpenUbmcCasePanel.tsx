import { useState } from 'react'
import { DisclosureRow, IconChevronRightOutlineRegular, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenUbmcCaseChatData } from './definition.ts'
import css from './OpenUbmcCasePanel.module.css'

export type OpenUbmcCasePanelProps = PropsRuntime<'conversation.chat.node', 'openubmc-case'> & PropsLocale<'openubmcCases'>

function dot(status: string, failed: boolean): StateDotState {
  if (failed) return 'error'
  if (['running', 'accepted', 'waiting_external'].includes(status)) return 'ongoing'
  if (['blocked', 'mutation_outcome_unknown', 'cancelled'].includes(status)) return 'warning'
  return 'done'
}

function json(value: unknown): string { return JSON.stringify(value) }

function listSection(label: string, values: readonly unknown[], none: string) {
  return <div className={css.section}>
    <span className={css.label}>{label}</span>
    <ul className={css.values}>
      {values.length === 0 ? <li>{none}</li> : values.map((value, index) => <li key={index}>{json(value)}</li>)}
    </ul>
  </div>
}

/** Display persisted Case facts; it provides no device-changing controls. */
export function OpenUbmcCasePanel({ node, useProjection, t }: OpenUbmcCasePanelProps) {
  const data: OpenUbmcCaseChatData = node.data
  const [open, setOpen] = useState(false)
  const view = useProjection('openubmc/cases')
  const observed = view?.cases.find(item => item.caseId === data.caseId)
  const inherited = node.anchorSeq < (view?.inheritedEventCount ?? 0)
  const stale = data.toolName !== 'case_read' || observed?.observedAtSeq !== node.anchorSeq
  const status = data.status ?? t('unknown')
  return <section className={css.root} data-openubmc-case data-case-id={data.caseId}>
    <DisclosureRow icon={<IconChevronRightOutlineRegular />} title={`${t('title')} · ${data.caseId}`} open={open} onToggle={() => { setOpen(value => !value) }} expandable expandOnRowClick>
      <div className={css.header}><StateDot state={dot(status, data.isError)} /><span>{data.isError ? t('failed') : t('succeeded')}</span></div>
      <div className={css.meta}>
        <span>{t('revision', { value: data.revision })}</span><span>{t('status', { value: status })}</span><span>{t('operation', { value: data.operationStatus })}</span>
        <span className={inherited ? css.warning : ''}>{inherited ? t('inherited') : t('current')}</span><span className={stale ? css.warning : ''}>{stale ? t('stale') : ''}</span>
      </div>
      {listSection(t('phase'), data.phases, t('none'))}
      {listSection(t('evidence'), data.evidence, t('none'))}
      {listSection(t('artifacts'), data.artifacts, t('none'))}
      {listSection(t('actions'), data.nextActions, t('none'))}
      {data.evidenceBody === null ? null : <pre className={css.values}>{data.evidenceBody}</pre>}

    </DisclosureRow>
  </section>
}
