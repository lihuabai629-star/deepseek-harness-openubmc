// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcAgentResultId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createAgentDefinition, type OpenUbmcAgentChatData } from '../src/client/agent-definition.ts'
import { OpenUbmcAgentPanel } from '../src/client/OpenUbmcAgentPanel.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('submits explicit Gate fields with their returned binding and hides controls on inherited or stale cards', async () => {
  const submitCommand = vi.fn(async (_line: string) => {})
  const data: OpenUbmcAgentChatData = { id: brandString<OpenUbmcAgentResultId>('run-1'), kind: 'run', status: 'waiting_response', isError: false, document: {
    gate: { gate_id: 'gate-1', gate_version: 3, schema_digest: 'sha256:abc', submission_id: 'submit-1', name: 'diagnosis.acceptance', input_schema: {
      properties: { status: { type: 'string', enum: ['completed', 'failed', 'cancelled'] }, payload: { properties: {
        root_cause: { type: 'string' }, evidence_ids: { type: 'array', items: { type: 'string' } },
      } } },
    } }, next_action: null,
  } }
  const props = { node: { key: 'run:1', id: '1', kind: 'openubmc-agent', target: 'chat', anchorSeq: SessionSeq(3), location: { kind: 'session' }, visibility: 'visible', data },
    useProjection: (key: string) => key === 'openubmc/runtime' ? { authorized: true, pending: 0, uncertain: 0 }
      : { agentResults: [{ id: data.id, observedAtSeq: SessionSeq(3) }], inheritedEventCount: 0 },
    submitCommand, t: makeTranslate(en),
  } as ComponentProps<typeof OpenUbmcAgentPanel>
  const view = render(<OpenUbmcAgentPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /openUBMC Run/ }))
  expect(submitCommand).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Result summary'), { target: { value: 'The object identifier is absent' } })
  fireEvent.change(screen.getByLabelText('root_cause'), { target: { value: 'Wrong object name' } })
  fireEvent.change(screen.getByLabelText('evidence_ids'), { target: { value: 'evidence-1\nevidence-2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit phase result' }))
  await waitFor(() => { expect(submitCommand).toHaveBeenCalledTimes(1) })
  expect(JSON.parse(submitCommand.mock.calls[0]![0].slice('/target-action '.length))).toEqual({
    kind: 'respond', run_id: 'run-1', gate_id: 'gate-1', gate_version: 3, schema_digest: 'sha256:abc', submission_id: 'submit-1',
    response: { status: 'completed', summary: 'The object identifier is absent', payload: { root_cause: 'Wrong object name', evidence_ids: ['evidence-1', 'evidence-2'] } },
  })
  for (const observation of [{ inheritedEventCount: 4, observedAtSeq: 3 }, { inheritedEventCount: 0, observedAtSeq: 4 }]) {
    view.rerender(<OpenUbmcAgentPanel {...props} useProjection={((key: string) => key === 'openubmc/runtime'
      ? { authorized: true, pending: 0, uncertain: 0 }
      : { inheritedEventCount: observation.inheritedEventCount, agentResults: [{ id: data.id, observedAtSeq: observation.observedAtSeq }],
      })} />)
    expect(screen.queryByRole('button', { name: 'Submit phase result' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel Run' })).toBeNull()
  }
})

it('offers reconciliation without replaying effects and requires a separate Session grant', async () => {
  const submitCommand = vi.fn(async (_line: string) => {})
  const data: OpenUbmcAgentChatData = { id: brandString<OpenUbmcAgentResultId>('run-incident'), kind: 'run', status: 'incident', isError: true,
    document: { incident: { incident_id: 'incident-1', allowed_commands: ['reconcile', 'cancel'] } } }
  const props = { node: { key: 'incident:1', id: '1', kind: 'openubmc-agent', target: 'chat', anchorSeq: SessionSeq(3), location: { kind: 'session' }, visibility: 'visible', data },
    useProjection: (key: string) => key === 'openubmc/runtime' ? { authorized: false, pending: 0, uncertain: 1 }
      : { agentResults: [{ id: data.id, observedAtSeq: SessionSeq(3) }], inheritedEventCount: 0 },
    submitCommand, t: makeTranslate(en),
  } as ComponentProps<typeof OpenUbmcAgentPanel>
  const view = render(<OpenUbmcAgentPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /openUBMC Run/ }))
  expect(screen.getByRole('button', { name: 'Reconcile execution' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Authorize this Session' }))
  await waitFor(() => { expect(submitCommand).toHaveBeenCalledWith('/target-authorize execute') })
  view.rerender(<OpenUbmcAgentPanel {...props} useProjection={((key: string) => key === 'openubmc/runtime'
    ? { authorized: true, pending: 1, uncertain: 0 }
    : { agentResults: [{ id: data.id, observedAtSeq: SessionSeq(3) }], inheritedEventCount: 0 })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Reconcile execution' }))
  await waitFor(() => { expect(submitCommand).toHaveBeenCalledWith('/target-action {"kind":"control","command":"reconcile","run_id":"run-incident"}') })
})
it('shows Gate version/schema, Incident recovery and Outcome while retaining the full failed Turn', () => {
  const data: OpenUbmcAgentChatData = { id: brandString<OpenUbmcAgentResultId>('run-1'), kind: 'run', status: 'incident', isError: true, document: {
    gate: { gate_id: 'gate-1', gate_version: 2, schema_digest: 'sha256:abc', input_schema: { type: 'object' } },
    incident: { incident_id: 'incident-1', code: 'effect_outcome_unknown', allowed_commands: ['reconcile'], operator_action: 'inspect' },
    outcome: { status: 'failed', summary: 'remaining source work' }, facts: [], gaps: ['unavailable verification'], next_action: { kind: 'control', command: 'reconcile' },
  } }
  const props: Partial<ComponentProps<typeof OpenUbmcAgentPanel>> = { node: { key: 'run:1', id: '1', kind: 'openubmc-agent', target: 'chat', anchorSeq: SessionSeq(3), location: { kind: 'session' }, visibility: 'visible', data },
    useProjection: () => undefined, t: makeTranslate(en) }
  render(<OpenUbmcAgentPanel {...props as ComponentProps<typeof OpenUbmcAgentPanel>} />)
  fireEvent.click(screen.getByRole('button', { name: /openUBMC Run/ }))
  expect(screen.getByText('Current-session observation')).toBeTruthy()
  for (const label of ['Response Gate', 'Recovery Incident', 'Outcome', 'Gaps', 'Complete receipt']) expect(screen.getByText(label)).toBeTruthy()
  expect(screen.getAllByText(/effect_outcome_unknown/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: /resume|reconcile/i })).toBeNull()
})

it('admits only trusted Agent schema/tool pairs into Conversation cards', () => {
  const definition = createAgentDefinition('runtime')
  const event = { type: 'tool/result' as const, surfaceOp: 'append' as const, seq: SessionSeq(1), time: 1, data: { turn: 1, step: 1,
    message: createToolResultMessage({ callId: ToolCallId('call-1'), content: [], isError: true }),
    meta: { mcp: { serverName: 'runtime', toolName: 'execute', structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-1', state: 'incident',
    } } },
  } }
  expect(definition.match(event)).not.toBeNull()
  expect(definition.match({ ...event, data: { ...event.data, meta: { mcp: { ...event.data.meta.mcp, serverName: 'foreign' } } } })).toBeNull()
  expect(definition.match({ ...event, data: { ...event.data, meta: { mcp: { ...event.data.meta.mcp, toolName: 'observe' } } } })).toBeNull()
})
