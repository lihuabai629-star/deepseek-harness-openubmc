/** Scripted provider for Case observation, native command and restart verification. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '../../src/types.ts'

class CaseModel extends LlmAdapter {
  private readonly ctx: Context
  constructor(ctx: Context) {
    super()
    this.ctx = ctx
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    const lastText = last?.content.filter(c => c.type === 'text').map(c => c.text).join('') ?? ''
    const resumed = last?.role === 'user' && lastText.includes('resume')
    if (resumed || last?.role === 'tool' && last.toolCallId === 'case-read') {
      const [agent] = this.ctx.agents.roots()
      if (agent === undefined) throw new Error('Missing composed Agent')
      const view = this.ctx.sessionProjections.stateOf(agent.session, 'openubmc/cases')?.view
      if (view?.cases.length !== 1 || view.cases[0]?.status !== 'mutation_outcome_unknown' || view.cases[0]?.operationStatus !== 'completed') throw new Error('Case observation was not restored')
      const command = await this.ctx.commands.execute(agent, '/case case-7', [], options.signal ?? new AbortController().signal)
      if (command?.result.kind !== 'success' || !command.result.text?.includes('inspect_mutation_records')) throw new Error('Native Case query failed')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: resumed ? 'CASE_RESUMED_OK' : 'CASE_COMMAND_OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const reading = last?.role === 'tool'
    if (reading) {
      const [agent] = this.ctx.agents.roots()
      if (agent === undefined) throw new Error('Missing composed Agent')
      const observed = this.ctx.sessionProjections.stateOf(agent.session, 'openubmc/cases')?.view.cases[0]
      if (observed?.operationStatus !== 'mutation_outcome_unknown' || !observed.isError) throw new Error('Structured failure observation is missing')
    }
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: {
      type: 'tool-call', id: ToolCallId(reading ? 'case-read' : 'runtime-call'),
      name: `mcp__openubmc-target-runtime__${reading ? 'case_read' : 'debug_run'}`,
      arguments: reading ? '{"case_id":"case-7"}' : '{}',
    } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

export const name = 'case-model'
export const inject = ['llm', 'agents', 'commands', 'sessionProjections']

/** Register an offline provider for the real Loader fixture. @param ctx - Owning context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new CaseModel(ctx)))
}
