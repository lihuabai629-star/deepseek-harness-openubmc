import { createInterface } from 'node:readline'
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'offline-agent', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['observe', 'execute'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    if (!request.params._meta?.taskId || !request.params._meta?.['openubmc/operationId']) throw new Error('Missing trusted metadata')
    if (request.params.name !== 'observe') throw new Error('Unexpected execute in observation fixture')
    result = { content: [{ type: 'text', text: 'Offline observation completed' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/observation-receipt', receipt_id: 'observation-sdk', status: 'complete',
      coverage: { requested: 1, available: 1, unavailable: 0, not_checked: 0, complete: true },
      freshness: { mode: 'live', max_age_seconds: 0, status: 'live', observed_at: '2026-10-19T00:00:00Z' },
      results: { ssh: { kind: 'capability', values: [{ name: 'ssh', status: 'available' }] } }, gaps: [], evidence: [{ uri: 'receipt://observation-sdk#ssh' }],
    } }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
