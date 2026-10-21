// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { OpenUbmcGateForm } from '../src/client/OpenUbmcGateForm.tsx'
import { responseGate } from '../src/client/agent-actions.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('retains explicit draft fields after malformed JSON and a rejected submission', async () => {
  const gate = responseGate({ gate_id: 'gate-1', gate_version: 1, schema_digest: 'digest', name: 'build.artifact', input_schema: {
    properties: { status: { enum: ['completed', 'failed', 'cancelled', 'partial'] }, payload: { properties: {
      artifact: { type: 'object' }, channel: { type: 'number', enum: [0, 1] }, mode: { type: 'string', enum: ['source', 'build'] },
    } } },
  } })!
  const submit = vi.fn(async (_response: object) => { throw new Error('Runtime rejected stale evidence') })
  render(<OpenUbmcGateForm gate={gate} disabled={false} submit={submit} t={makeTranslate(en)} />)
  fireEvent.change(screen.getByLabelText('Result summary'), { target: { value: 'Explicit artifact' } })
  fireEvent.change(screen.getByLabelText('artifact'), { target: { value: '{' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit phase result' }))
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe(en.invalidPayload)
  fireEvent.change(screen.getByLabelText('artifact'), { target: { value: '{"sha256":"expected"}' } })
  fireEvent.change(screen.getByLabelText('channel'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('mode'), { target: { value: 'build' } })
  fireEvent.change(screen.getByLabelText('Phase result'), { target: { value: 'partial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit phase result' }))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(en.submitFailed) })
  expect(submit).toHaveBeenCalledWith({ status: 'partial', summary: 'Explicit artifact', payload: {
    artifact: { sha256: 'expected' }, channel: 0, mode: 'build',
  } })
  expect(screen.getByLabelText('Result summary')).toHaveProperty('value', 'Explicit artifact')
  expect(screen.getByLabelText('artifact')).toHaveProperty('value', '{"sha256":"expected"}')
})

it('does not invent response fields for unsupported or malformed Gate metadata', () => {
  for (const value of [null, {}, { gate_id: 'g', gate_version: 0, schema_digest: 's', name: 'gate', input_schema: {} }]) {
    expect(responseGate(value)).toBeNull()
  }
  const gate = responseGate({ gate_id: 'g', gate_version: 1, schema_digest: 's', name: 'gate', input_schema: { properties: null } })!
  const submit = vi.fn(async () => {})
  render(<OpenUbmcGateForm gate={gate} disabled submit={submit} t={makeTranslate(en)} />)
  expect(screen.getByRole('button', { name: 'Submit phase result' }).hasAttribute('disabled')).toBe(true)
  expect(submit).not.toHaveBeenCalled()
})
