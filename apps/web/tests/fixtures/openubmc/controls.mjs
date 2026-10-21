/** External MCP fixture; the real Host owns Session grants and Run bindings. */
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'web-agent-fixture', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['observe', 'execute'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    const action = request.params.arguments
    if (request.params.name !== 'execute' || !request.params._meta?.taskId || !request.params._meta?.['openubmc/operationId']) throw new Error('Missing owned execute metadata')
    appendFileSync(process.argv[2], JSON.stringify(action) + '\n')
    const responding = action.kind === 'respond'
    if (responding && (action.gate_id !== 'gate-form' || action.gate_version !== 3 || action.schema_digest !== 'sha256:form' || action.submission_id !== 'submission-form')) throw new Error('Lost Gate binding')
    result = { content: [{ type: 'text', text: responding ? 'WEB_GATE_COMPLETED' : 'WEB_RECONCILED' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-web', state: responding ? 'completed' : 'waiting_response',
      gate: responding ? null : { gate_id: 'gate-form', gate_version: 3, schema_digest: 'sha256:form', submission_id: 'submission-form', name: 'diagnosis.acceptance', input_schema: {
        type: 'object', properties: { status: { type: 'string', enum: ['completed', 'failed'] }, summary: { type: 'string' }, payload: { type: 'object', properties: { root_cause: { type: 'string' }, evidence_ids: { type: 'array', items: { type: 'string' } } } } },
      } }, incident: null, facts: [], gaps: [], outcome: responding ? { status: 'completed', summary: 'explicit human response' } : null,
    } }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
