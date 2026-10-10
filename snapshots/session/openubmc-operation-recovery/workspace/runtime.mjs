import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
let dispatched = 0
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'offline-recovery', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['upgrade_run', 'case_read'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    const task = request.params._meta?.taskId
    if (!task) throw new Error('Missing trusted task identity')
    if (request.params.name === 'upgrade_run' && dispatched++ === 0) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32001, message: 'Operation response lost; reconcile Case records.' } }) + '\n')
      continue
    }
    const case_id = `case-${createHash('sha256').update(task).digest('hex').slice(0, 24)}`
    const envelope = { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id, revision: 1, status: 'completed', operation: { name: request.params.name, status: 'completed' }, evidence_refs: [], next_actions: [] }
    result = { content: [{ type: 'text', text: 'Offline recovery facts' }], structuredContent: request.params.name === 'case_read' ? {
      schema: 'openubmc.target-runtime.v1/context-runtime', case_id, revision: 1, status: 'open', operations: [], mutation_outcome_unknown_operations: {},
      workflow_inputs: { deadline: 1 }, evidence_refs: [], next_actions: [], agent_envelope: envelope,
    } : envelope }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
}
