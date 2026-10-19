import { createInterface } from 'node:readline'
let original
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'offline-agent-recovery', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['observe', 'execute'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    const operation = request.params._meta?.['openubmc/operationId']
    if (!request.params._meta?.taskId || !operation) throw new Error('Missing trusted native metadata')
    if (request.params.name === 'execute' && original === undefined) {
      original = operation
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32001, message: 'Start response lost; reconcile the original operation.' } }) + '\n')
      continue
    }
    if (request.params.name === 'execute' && original !== operation) throw new Error('Recovery changed the native operation identity')
    result = { content: [{ type: 'text', text: 'Offline Agent recovery facts' }], structuredContent: request.params.name === 'observe' ? {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/observation-receipt', receipt_id: 'observation-1', status: 'complete', coverage: { complete: true }, results: {}, gaps: [],
    } : { schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-recovered', state: 'running', gate: null, incident: null, facts: [], gaps: [], outcome: null, next: 'resume' } }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
