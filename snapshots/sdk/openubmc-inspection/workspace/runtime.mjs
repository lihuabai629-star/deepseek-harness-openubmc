import { createInterface } from 'node:readline'
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'offline-agent', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['observe', 'execute'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    if (!request.params._meta?.taskId || !request.params._meta?.['openubmc/operationId']) throw new Error('Missing trusted metadata')
    if (request.params.name === 'execute') {
      if (request.params.arguments.kind !== 'start') throw new Error('Unexpected continuation in authorization fixture')
      result = { content: [{ type: 'text', text: 'Offline Run awaiting source evidence' }], structuredContent: {
        schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-sdk', state: 'waiting_response',
        gate: { gate_id: 'gate-sdk', gate_version: 1, schema_digest: 'sha256:abc', input_schema: { type: 'object' } },
        incident: null, facts: [], gaps: [], outcome: null, next: 'Supply source evidence for the current Gate',
      } }
    } else if (request.params.name === 'observe') result = { content: [{ type: 'text', text: 'Offline observation completed' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/observation-receipt', receipt_id: 'observation-sdk', status: 'complete',
      coverage: { requested: 1, available: 1, unavailable: 0, not_checked: 0, complete: true },
      freshness: { mode: 'live', max_age_seconds: 0, status: 'live', observed_at: '2026-10-19T00:00:00Z' },
      results: { ssh: { kind: 'capability', values: [{ name: 'ssh', status: 'available' }] } }, gaps: [], evidence: [{ uri: 'receipt://observation-sdk#ssh' }],
    } }
    else throw new Error('Unexpected tool in SDK fixture')
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
