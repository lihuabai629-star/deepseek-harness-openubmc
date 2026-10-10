import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin })
for await (const line of lines) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result
  switch (request.method) {
    case 'initialize':
      result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'runtime-fixture', version: '1' } }
      break
    case 'tools/list':
      result = { tools: [
        { name: 'debug_run', description: 'Read diagnostic state.', inputSchema: { type: 'object', properties: {} } },
        { name: 'case_read', description: 'Read recorded Case state.', inputSchema: { type: 'object', properties: { case_id: { type: 'string' } }, required: ['case_id'] } },
      ] }
      break
    case 'tools/call':
      if (!request.params._meta?.taskId) throw new Error('Missing trusted task identity')
      if (request.params.name === 'case_read') {
        if (request.params.arguments.case_id !== 'case-7') throw new Error('Unexpected Case')
        result = { content: [{ type: 'text', text: 'Case 已读取' }], structuredContent: {
          schema: 'openubmc.target-runtime.v1/context-runtime', case_id: 'case-7', revision: 2, status: 'mutation_outcome_unknown',
          evidence_refs: [{ evidence_id: 'evidence-1' }], next_actions: ['inspect_mutation_records'],
          agent_envelope: { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: 'case-7', revision: 2, status: 'completed',
            operation: { name: 'case_read', status: 'completed' }, evidence_refs: [{ evidence_id: 'evidence-1' }], next_actions: ['inspect_mutation_records'] },
        } }
        break
      }
      result = { isError: true, content: [{ type: 'text', text: '需要恢复' }], structuredContent: {
        schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: 'case-7', revision: 2, status: 'mutation_outcome_unknown',
        operation: { name: 'debug_run', status: 'mutation_outcome_unknown' }, evidence_refs: [{ evidence_id: 'evidence-1' }], next_actions: ['case_read'],
      } }
      break
    default:
      result = {}
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
