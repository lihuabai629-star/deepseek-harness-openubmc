/** Script only model and human input; the composed tools, Skills and Runtime stay real. */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-user-questions'

const jsonObject = z.record(z.string(), z.json())

function call(id: string, name: string, args: object): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: JSON.stringify(args) } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function text(value: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: value } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function structuredResult(options: GenerateOptions): z.infer<typeof jsonObject> {
  const tool = options.messages.findLast(message => message.role === 'tool')
  if (tool?.role !== 'tool' || tool.isError) throw new Error('The real workflow tool failed before its expected result.')
  const value = tool.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
  const start = value.lastIndexOf('\n{')
  return jsonObject.parse(JSON.parse(value.slice(start < 0 ? value.indexOf('{') : start + 1)))
}

class WorkflowModel extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const serialized = JSON.stringify(options.messages)
    if (!serialized.includes('A response_required Gate requests actual work and evidence')
      || !serialized.includes('progress.status is no_progress')
      || !serialized.includes('openUBMC recorded Session state:')) {
      throw new Error('The model request omitted native workflow guidance or durable runtime context.')
    }
    const user = options.messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    const resumed = JSON.stringify(user?.content).includes('CONTINUE_SAME_RUN')
    const tools = options.messages.filter(message => message.role === 'tool')
    if (!resumed) {
      if (tools.length === 0) yield* call('native-skill', 'skill', { name: 'openubmc-debug' })
      else if (tools.length === 1) {
        if (!serialized.includes('openUBMC Runtime Debug')) throw new Error('The real Skill body was not loaded.')
        yield* call('native-observe', 'mcp__openubmc-target-runtime__observe', {
          target: '192.0.2.10', selectors: [{ id: 'ssh', kind: 'capability', names: ['ssh'] }],
        })
      } else if (tools.length === 2) {
        if (structuredResult(options).status !== 'complete') throw new Error('The actual ObservationReceipt was incomplete.')
        yield* call('native-start', 'mcp__openubmc-target-runtime__execute', {
          kind: 'start', target: '192.0.2.10', intent: 'diagnose-and-fix', delivery_strategy: 'source-only',
        })
      } else {
        const turn = structuredResult(options)
        if (turn.response_required !== true || jsonObject.parse(turn.gate).name !== 'diagnosis.acceptance') {
          throw new Error('The real Runtime did not request diagnosis evidence.')
        }
        if (!serialized.includes('owned Runs 1; open Gates 1')) throw new Error('The next request omitted the committed Gate context.')
        yield* text('NATIVE_DIAGNOSIS_GATE_RECORDED')
      }
      return
    }
    const turn = structuredResult(options)
    if (turn.state === 'failed') {
      if (jsonObject.parse(turn.outcome).status !== 'failed' || !serialized.includes('open Gates 0')) {
        throw new Error('The incomplete diagnosis was not retained as a terminal failed outcome.')
      }
      yield* text('NATIVE_DIAGNOSIS_GAP_RECORDED')
      return
    }
    if (jsonObject.safeParse(turn.progress).data?.status !== 'no_progress') {
      yield* call('native-resume', 'mcp__openubmc-target-runtime__execute', { kind: 'resume', run_id: turn.run_id })
      return
    }
    const gate = jsonObject.parse(turn.gate)
    if (gate.name !== 'diagnosis.acceptance') throw new Error('The Gate changed while testing no-progress continuation.')
    yield* call('native-respond', 'mcp__openubmc-target-runtime__execute', {
      kind: 'respond', run_id: turn.run_id, gate_id: gate.gate_id,
      gate_version: gate.gate_version, schema_digest: gate.schema_digest, submission_id: gate.submission_id,
      response: { status: 'failed', summary: 'Offline observations do not establish a verified code owner or causal diagnosis.', payload: {} },
    })
  }
}

export const name = 'native-workflow-model'
export const inject = ['llm', 'userQuestions']

/** Supply external model tokens and one explicit human authorization. @param ctx - Test composition. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new WorkflowModel()))
  ctx.on('user-questions/request', async (request, next) => {
    if (request.questions.length !== 1 || request.questions[0]?.id !== 'openubmc-execution') return next()
    if (!request.questions[0].question.includes('192.0.2.10') || !request.questions[0].detail?.includes('source-only')) {
      throw new Error('Native authorization did not describe the proposed target and delivery.')
    }
    await appendFile(join(process.cwd(), 'human-authorization.jsonl'), JSON.stringify(request.questions) + '\n')
    return { answers: [{ id: 'openubmc-execution', selected: ['Authorize this Run'] }] }
  })
}
