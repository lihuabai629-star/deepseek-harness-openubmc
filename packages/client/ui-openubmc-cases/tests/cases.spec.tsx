// @vitest-environment jsdom
import { z } from 'zod'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {} from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcCaseId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import type { ConversationMatch } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createCasesDefinition, type OpenUbmcCaseChatData } from '../src/client/definition.ts'
import { OpenUbmcCasePanel } from '../src/client/OpenUbmcCasePanel.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const data: OpenUbmcCaseChatData = { caseId: brandString<OpenUbmcCaseId>('case-1'), revision: 3, status: 'active', operationStatus: 'blocked', toolName: 'upgrade_run', isError: true, evidence: [{ evidence_id: 'evidence-1' }], artifacts: [{ artifact_sha256: 'abc' }], phases: [{ phase_type: 'build.artifact' }], nextActions: ['read journal'], evidenceBody: null }
function props(overrides: Partial<ComponentProps<typeof OpenUbmcCasePanel>> = {}) {
  return { node: { key: 'case:1', id: '1', kind: 'openubmc-case', target: 'chat', anchorSeq: SessionSeq(3), location: { kind: 'session' }, visibility: 'visible', data },
    useProjection: () => undefined, t: makeTranslate(en),
    refreshCase: vi.fn(async () => null), readEvidence: vi.fn(async () => null), ...overrides } as ComponentProps<typeof OpenUbmcCasePanel>
}
it('displays distinct Case and failed operation state, phases, artifacts and bounded evidence actions', async () => {
  const p = props()
  render(<OpenUbmcCasePanel {...p} />)
  fireEvent.click(screen.getByRole('button', { name: /openUBMC Case/ }))
  expect(screen.getByText('Case status: active')).toBeTruthy()
  expect(screen.getByText('Operation: blocked')).toBeTruthy()
  expect(screen.getByText('Operation failed')).toBeTruthy()
  expect(screen.getByText('May be stale')).toBeTruthy()
  expect(screen.getByText(/build.artifact/)).toBeTruthy()
  expect(screen.getByText(/artifact_sha256/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Read evidence evidence-1' }))
  await waitFor(() => { expect(p.readEvidence).toHaveBeenCalledWith('evidence-1') })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Case' }))
  await waitFor(() => { expect(p.refreshCase).toHaveBeenCalledOnce() })
})
it('keeps inherited observations read-only and renders command failures', async () => {
  const p = props({ useProjection: () => ({ cases: [], failure: null, inheritedEventCount: 5 }) })
  const rendered = render(<OpenUbmcCasePanel {...p} />)
  fireEvent.click(screen.getByRole('button', { name: /openUBMC Case/ }))
  expect(screen.getByText('Inherited observation')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh Case' }).hasAttribute('disabled')).toBe(true)
  rendered.rerender(<OpenUbmcCasePanel {...props({ refreshCase: async () => 'Runtime unavailable' })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Case' }))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('Runtime unavailable') })
})
it('accepts trusted nested envelopes and rejects mismatched identity, operation and malformed reports', () => {
  const definition = createCasesDefinition('runtime')
  const envelope = { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: 'case-1', revision: 3, status: 'completed', operation: { name: 'case_read', status: 'completed' }, evidence_refs: [], next_actions: [], capsule: { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: 'case-1', case_revision: 3, status: 'active', next_actions: [], artifact_revisions: [{ artifact_sha256: 'abc' }] } }
  const event = (structured: object, serverName = 'runtime'): ConversationMatch['event'] => ({ type: 'openubmc/inspection', seq: SessionSeq(3), time: 1, data: { commandId: CommandId('inspect'), message: { isError: false }, meta: { mcp: { serverName, toolName: 'case_read', structuredContent: z.json().parse(JSON.parse(JSON.stringify(structured))) } } } })
  expect(definition.match(event(envelope))).not.toBeNull()
  expect(definition.match(event(envelope, 'untrusted'))).toBeNull()
  expect(definition.match(event({ ...envelope, status: 'failed' }))).toBeNull()
  expect(definition.match(event({ ...envelope, capsule: { ...envelope.capsule, case_id: 'foreign' } }))).toBeNull()
  expect(definition.match(event({ ...envelope, operation: { name: 'upgrade_run', status: 'completed' } }))).toBeNull()
  expect(definition.match(event({ schema: 'openubmc.target-runtime.v1/context-runtime', agent_envelope: envelope, case_id: 'foreign', revision: 3, status: 'active', evidence_refs: [], next_actions: [] }))).toBeNull()
})

it('shows current successful observations, empty sections, bounded bodies and localized unknown status', () => {
  for (const status of ['running', 'blocked', 'completed', null]) {
    const value = { ...data, isError: false, status, toolName: 'case_read', evidence: [null, [], 'unreadable', { evidence_id: 1 }], phases: [], artifacts: [], nextActions: [], evidenceBody: 'Evidence body' }
    render(<OpenUbmcCasePanel {...props({ node: { ...props().node, data: value }, useProjection: () => ({ cases: [{ caseId: 'case-1', observedAtSeq: 3 }], inheritedEventCount: 0 } as never) })} />)
    fireEvent.click(screen.getByRole('button', { name: /openUBMC Case/ }))
    expect(screen.queryByText('May be stale')).toBeNull()
    expect(screen.getByText('Operation completed')).toBeTruthy()
    expect(screen.getByText('Evidence body')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh Case' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: /Read evidence/ })).toBeNull()
    cleanup()
  }
})

it('disables concurrent inspection and contains rejected commands, including settlement after unmount', async () => {
  for (const failure of [new Error('lost'), 'lost']) {
    render(<OpenUbmcCasePanel {...props({ refreshCase: async () => { throw failure } })} />)
    fireEvent.click(screen.getByRole('button', { name: /openUBMC Case/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Case' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('lost') })
    cleanup()
  }
  for (const reject of [false, true]) {
    let settle: () => void = () => {}
    const pending = new Promise<string | null>((resolve, fail) => { settle = reject ? () => { fail(new Error('late')) } : () => { resolve(null) } })
    const view = render(<OpenUbmcCasePanel {...props({ refreshCase: () => pending })} />)
    fireEvent.click(screen.getByRole('button', { name: /openUBMC Case/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Case' }))
    expect(screen.getByRole('button', { name: 'Refresh Case' }).hasAttribute('disabled')).toBe(true)
    view.unmount()
    settle()
    await pending.catch(() => {})
  }
})

it('materializes durable report, capsule and evidence events while rejecting malformed wire data', () => {
  const definition = createCasesDefinition('runtime')
  const envelope = { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: 'case-1', revision: 3, status: 'completed', operation: { name: 'case_read', status: 'completed' }, evidence_refs: [], next_actions: [] }
  const report = { schema: 'openubmc.target-runtime.v1/context-runtime', case_id: 'case-1', revision: 3, status: 'active', evidence_refs: [{ evidence_id: 'e' }], next_actions: ['next'], agent_envelope: envelope }
  const capsule = { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: 'case-1', case_revision: 3, status: 'active', next_actions: [] }
  const event = (structured: object): ConversationMatch['event'] => ({ type: 'openubmc/inspection', seq: SessionSeq(3), time: 1, data: { commandId: CommandId('inspect'), message: { isError: false }, meta: { mcp: { serverName: 'runtime', toolName: 'case_read', structuredContent: z.json().parse(JSON.parse(JSON.stringify(structured))) } } } })
  expect(definition.match({ type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } })).toBeNull()
  const context = { key: 'case:3', kind: 'openubmc-case', id: '3', matches: [], start: undefined, state: undefined, current: new Map() }
  expect(definition.buildViewNode!(context)).toBeNull()
  for (const structured of [envelope, { ...envelope, capsule }, { ...envelope, capsule: { ...capsule, artifact_revisions: [] } }, report,
    { ...report, artifact_revisions: [{ artifact_sha256: 'digest' }], phase_records: [{ phase_type: 'build' }] },
    { schema: 'openubmc.target-runtime.v1/context-runtime/evidence-read', case_id: 'case-1', body: 'bounded', agent_envelope: envelope }]) {
    const entry = event(structured)
    expect(definition.match(entry)).not.toBeNull()
    const start = { event: entry, role: 'start' as const, location: { kind: 'session' as const } }
    const state = definition.start(context, start, { previous: () => undefined })
    expect(definition.update({ ...context, state }, start)).toBe(state)
    expect(definition.buildViewNode!({ ...context, start })).toBeNull()
    expect(definition.buildViewNode!({ ...context, state, start })).toMatchObject({ kind: 'openubmc-case', data: { caseId: 'case-1', revision: 3 } })
  }
  for (const structured of [{ ...envelope, capsule: {} }, { ...envelope, agent_envelope: null }, { ...envelope, capsule: { ...capsule, next_actions: undefined } }, { ...envelope, capsule: { ...capsule, case_revision: 4 } }, { ...report, evidence_refs: 'invalid' },
    { ...report, revision: 4 }, { schema: 'openubmc.target-runtime.v1/context-runtime/evidence-read', case_id: 'foreign', body: 'x', agent_envelope: envelope },
    { schema: 'openubmc.target-runtime.v1/context-runtime/evidence-read', case_id: 'case-1', body: 1, agent_envelope: envelope }]) {
    const entry = event(structured)
    expect(definition.match(entry)).toBeNull()
    expect(() => definition.start(context, { event: entry, role: 'start', location: { kind: 'session' } }, { previous: () => undefined })).toThrow('validated metadata')
  }
})
