/** Native Run and observation receipt presentation. @module */
import { useState } from 'react'
import { DisclosureRow, IconChevronRightOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './agent-definition.ts'
import css from './OpenUbmcCasePanel.module.css'

/**
 * Render recorded Gate, Incident and Outcome details without executing a continuation.
 * @param props - Durable Conversation node, projection hook and localized copy.
 * @returns the expandable Run or observation receipt.
 */
export function OpenUbmcAgentPanel({ node, useProjection, t }: PropsRuntime<'conversation.chat.node', 'openubmc-agent'> & PropsLocale<'openubmcCases'>) {
  const [open, setOpen] = useState(false)
  const { data } = node
  const view = useProjection('openubmc/cases')
  const inherited = node.anchorSeq < (view?.inheritedEventCount ?? 0)
  const latest = view?.agentResults?.find(item => item.id === data.id)
  const stale = latest !== undefined && latest.observedAtSeq !== node.anchorSeq
  const warning = ['incident', 'waiting_response', 'cancelled', 'incomplete'].includes(data.status)
  return <section className={css.root} data-openubmc-agent data-run-id={data.id}>
    <DisclosureRow icon={<IconChevronRightOutlineRegular />} title={`${t(data.kind === 'run' ? 'runTitle' : 'receiptTitle')} · ${data.id}`}
      open={open} onToggle={() => { setOpen(value => !value) }} expandable expandOnRowClick>
      <div className={css.header}><StateDot
        state={data.isError ? 'error' : warning ? 'warning' : data.status === 'running' ? 'ongoing' : 'done'} />
      <span>{data.status}</span></div>
      <div className={css.meta}>
        <span>{inherited ? t('inherited') : t('current')}</span><span>{stale ? t('stale') : t('recorded')}</span>
      </div>
      {(['gate', 'incident', 'outcome', 'facts', 'gaps', 'coverage', 'freshness',
        'results', 'evidence', 'progress', 'next_action'] as const).map(key =>
        data.document[key] == null ? null : <div className={css.section} key={key}>
          <span className={css.label}>{t(key)}</span><pre className={css.values}>{JSON.stringify(data.document[key], null, 2)}</pre>
        </div>)}
      <div className={css.section}><span className={css.label}>{t('rawResult')}</span><pre className={css.values}>{JSON.stringify(data.document, null, 2)}</pre></div>
    </DisclosureRow>
  </section>
}
