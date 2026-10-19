/** Keyless provider exercising denials through the composed dsh application. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'

class AuthorityModel extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const last = options.messages.at(-1)
    const allowed = options.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('allowed'))
    if (allowed) {
      if (last?.role === 'tool') {
        if (last.isError || !JSON.stringify(last.content).includes('OWNED_EXECUTION_OK')) throw new Error('Authorized execution did not reach the owned provider.')
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'AUTHORITY_ALLOWED_OK' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } else {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('allowed-action'), name: 'mcp__openubmc-target-runtime__execute', arguments: '{"kind":"start"}' } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      }
      return
    }
    const resumed = last?.role === 'user' && JSON.stringify(last.content).includes('resume')
    const tools = options.messages.filter(message => message.role === 'tool')
    if (resumed || tools.length === 2) {
      if (!JSON.stringify(tools[0]).includes('human authorization for this scope') || !JSON.stringify(tools[1]).includes('does not belong')) {
        throw new Error('The composed Runtime did not deny unauthorized execution and foreign Case access.')
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: resumed ? 'AUTHORITY_RESUMED_OK' : 'AUTHORITY_DENIAL_OK' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const reading = tools.length === 1
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: {
      type: 'tool-call', id: ToolCallId(reading ? 'foreign-case' : 'target-action'),
      name: 'mcp__openubmc-target-runtime__execute',
      arguments: reading ? '{"kind":"resume","run_id":"foreign-run"}' : '{"kind":"start"}',
    } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}
export const name = 'authority-model'
export const inject = ['llm']
/** Register the test provider. @param ctx - Owning composition context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new AuthorityModel()))
}
