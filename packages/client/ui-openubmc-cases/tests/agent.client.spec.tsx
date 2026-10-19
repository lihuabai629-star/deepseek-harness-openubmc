// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { OpenUbmcAgentResultId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createAgentDefinition, type OpenUbmcAgentChatData } from '../src/client/agent-definition.ts'
import { OpenUbmcAgentPanel } from '../src/client/OpenUbmcAgentPanel.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
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
