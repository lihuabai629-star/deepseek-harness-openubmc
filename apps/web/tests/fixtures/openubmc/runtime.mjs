import { createInterface } from 'node:readline'
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result = {}
  if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'offline-case', version: '1' } }
  if (request.method === 'tools/list') result = { tools: ['case_read', 'evidence_read'].map(name => ({ name, description: name, inputSchema: { type: 'object' } })) }
  if (request.method === 'tools/call') {
    if (request.params._meta?.taskId === undefined) throw new Error('Missing trusted task metadata')
    const name = request.params.name
    const caseId = request.params.arguments.case_id
    const evidence = [{ evidence_id: 'evidence-1', kind: 'diagnostic' }]
    const envelope = { schema: 'openubmc.target-runtime.v1/agent-envelope', case_id: caseId, revision: 4, status: 'completed', operation: { name, status: 'completed' }, evidence_refs: evidence, next_actions: ['inspect diagnostic'], capsule: { schema: 'openubmc.target-runtime.v1/context-runtime/capsule', case_id: caseId, case_revision: 4, status: 'active', artifact_revisions: [{ artifact_sha256: 'offline-digest' }], next_actions: ['inspect diagnostic'] } }
    const structured = name === 'case_read' ? { schema: 'openubmc.target-runtime.v1/context-runtime', case_id: caseId, revision: 4, status: 'active', operations: [], mutation_outcome_unknown_operations: {}, workflow_inputs: { deadline: 10 }, phase_records: [{ phase_type: 'build.artifact', status: 'completed' }], evidence_refs: evidence, next_actions: ['inspect diagnostic'], agent_envelope: envelope } : { schema: 'openubmc.target-runtime.v1/context-runtime/evidence-read', case_id: caseId, body: 'Bounded offline evidence body', agent_envelope: envelope }
    result = { content: [{ type: 'text', text: 'Offline inspection completed' }], structuredContent: structured }
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
})
