import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'

const mode = process.env.DSH_RECOVERY_MODE
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'recovery-fixture', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['debug_run', 'upgrade_run', 'case_read', 'runtime_status'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    const taskId = request.params._meta?.taskId
    if (!taskId) throw new Error('Missing trusted identity')
    if (['debug_run', 'upgrade_run'].includes(request.params.name)) {
      appendFileSync(process.env.DSH_RECOVERY_MARKER, 'started\n')
      if (mode === 'disconnect') { process.exit(0) }
      if (mode !== 'complete') return
    }
    const caseId = `case-${createHash('sha256').update(taskId).digest('hex').slice(0, 24)}`
    const envelope = { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: caseId, revision: 1, status: 'completed', operation: { name: request.params.name, status: 'completed' }, evidence_refs: [], next_actions: [] }
    result = { content: [{ type: 'text', text: 'RECOVERY_READ_OK' }], structuredContent: request.params.name === 'case_read' ? {
      schema: 'openubmc.target-runtime.v1/context-runtime', case_id: caseId, revision: 1, status: 'active', operations: [],
      mutation_outcome_unknown_operations: {}, workflow_inputs: { deadline: 1 }, evidence_refs: [], next_actions: [], agent_envelope: envelope,
    } : envelope }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
})
