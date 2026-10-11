import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'authority-runtime', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['debug_run', 'case_read'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    const taskId = request.params._meta?.taskId
    if (!taskId) throw new Error('Missing trusted task identity')
    const caseId = `case-${createHash('sha256').update(taskId).digest('hex').slice(0, 24)}`
    if (request.params.arguments.case_id !== caseId) throw new Error('Foreign Case reached the provider')
    result = { content: [{ type: 'text', text: 'OWNED_EXECUTION_OK' }], structuredContent: {
      schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: caseId, revision: 1, status: 'completed',
      operation: { name: request.params.name, status: 'completed' }, evidence_refs: [], next_actions: [],
    } }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
