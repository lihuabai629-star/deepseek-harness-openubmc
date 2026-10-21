/** Current Runtime Gate response fields; identity is supplied by the owning Run card. @module */
import { useState } from 'react'
import { z } from 'zod'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { fieldSchema, properties, type ResponseGate } from './agent-actions.ts'
import css from './OpenUbmcCasePanel.module.css'

interface GateFormProps extends PropsLocale<'openubmcCases'> {
  gate: ResponseGate
  disabled: boolean
  submit(this: void, response: Record<string, JsonValue>): Promise<void>
}

/**
 * Collect explicit phase results without deciding acceptance or advancing on render.
 * @param props - Current Gate, execution availability and human submission callback.
 * @returns the retained response draft; Runtime validates its complete schema.
 */
export function OpenUbmcGateForm({ gate, disabled, submit, t }: GateFormProps) {
  const [status, setStatus] = useState('completed')
  const [summary, setSummary] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const fields = properties(properties(gate.input_schema).payload)
  const statusSchema = properties(gate.input_schema).status
  const statuses = statusSchema === undefined ? [] : fieldSchema(statusSchema).enum
  const availableStatuses = Array.isArray(statuses) ? statuses.filter((value): value is string => typeof value === 'string') : []
  return <form data-openubmc-gate={gate.gate_id} className={css.form} onSubmit={(event) => {
    event.preventDefault()
    setError(null)
    const payload: Record<string, JsonValue> = {}
    try {
      for (const [key, value] of Object.entries(fields)) {
        const definition = fieldSchema(value)
        const text = draft[key] ?? ''
        if (definition.type === 'array' && fieldSchema(definition.items ?? {}).type === 'string') {
          payload[key] = text.split('\n').map(line => line.trim()).filter(Boolean)
        } else if (text !== '') {
          payload[key] = definition.type === 'string' ? text : z.json().parse(JSON.parse(text))
        }
      }
    } catch (_error) {
      setError(t('invalidPayload'))
      return
    }
    void submit({ status, summary, payload }).catch(() => { setError(t('submitFailed')) })
  }}>
    <span className={css.label}>{gate.name}</span>
    <label>{t('responseStatus')}<select value={status} onChange={(event) => { setStatus(event.target.value) }} disabled={disabled}>
      {availableStatuses.map(value => <option key={value} value={value}>{t(value === 'completed' ? 'responseCompleted'
        : value === 'failed' ? 'responseFailed' : value === 'cancelled' ? 'responseCancelled' : 'responsePartial')}</option>)}
    </select></label>
    <label>{t('responseSummary')}<Input value={summary} required disabled={disabled} onChange={(event) => { setSummary(event.target.value) }} /></label>
    {Object.entries(fields).map(([key, value]) => {
      const definition = fieldSchema(value)
      const choices = definition.enum
      return <label key={key}>{typeof definition.title === 'string' ? definition.title : key}
        {Array.isArray(choices) ? <select value={draft[key] ?? ''} disabled={disabled} onChange={(event) => { setDraft(previous => ({ ...previous, [key]: event.target.value })) }}>
          <option value="">{t('selectValue')}</option>
          {choices.map(choice => <option key={JSON.stringify(choice)} value={(typeof choice === 'string' ? choice : JSON.stringify(choice))}>{(typeof choice === 'string' ? choice : JSON.stringify(choice))}</option>)}
        </select> : definition.type === 'string' ? <Input value={draft[key] ?? ''} disabled={disabled}
          onChange={(event) => { setDraft(previous => ({ ...previous, [key]: event.target.value })) }} />
          : <textarea value={draft[key] ?? ''} disabled={disabled}
            aria-description={definition.type === 'array' && fieldSchema(definition.items ?? {}).type === 'string' ? t('onePerLine') : t('jsonValue')}
            onChange={(event) => { setDraft(previous => ({ ...previous, [key]: event.target.value })) }} />}
      </label>
    })}
    {error === null ? null : <span role="alert" className={css.bad}>{error}</span>}
    <Button type="submit" disabled={disabled}>{t('submitResponse')}</Button>
  </form>
}
