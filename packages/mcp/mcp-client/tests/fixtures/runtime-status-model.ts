/** Keyless model for offline openUBMC profile startup checks. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'

class RuntimeStatusModel extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!options.tools?.some(tool => tool.name === 'mcp__openubmc-target-runtime__runtime_status')) {
      throw new Error('Runtime status tool was not discovered')
    }
    if (!options.tools?.some(tool => tool.name.startsWith('mcp__openubmc-kb__'))) {
      throw new Error('Knowledge tools were not discovered')
    }
    const last = options.messages.at(-1)
    const result = last?.role === 'tool' ? last : undefined
    if (result === undefined) {
      const block = { type: 'tool-call' as const, id: ToolCallId('runtime-status'), name: 'mcp__openubmc-target-runtime__runtime_status', arguments: '{}' }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      if (!JSON.stringify(result).includes('completed')) throw new Error('Runtime status envelope is missing')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'OPENUBMC_OFFLINE_OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

export const name = 'runtime-status-model'
export const inject = ['llm']

/** Register the offline model; it calls only runtime_status. @param ctx - Owning fixture context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new RuntimeStatusModel()))
}
