import { createInterface } from 'node:readline'

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'agent-runtime', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['observe', 'execute'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    if (!request.params._meta?.taskId || !/^dsh-[a-f0-9]{64}$/.test(request.params._meta?.['openubmc/operationId'] ?? '')) throw new Error('Missing trusted native metadata')
    if (request.params.arguments.kind !== 'start' || 'case_id' in request.params.arguments) throw new Error('Invalid Agent input reached the provider')
    result = { content: [{ type: 'text', text: 'OWNED_EXECUTION_OK' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-gateway-v1/turn', run_id: 'run-owned', state: 'running',
      gate: null, incident: null, facts: [], gaps: [], outcome: null, next: 'resume',
    } }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
