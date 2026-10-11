/** Keyless external model driving the real application recovery path. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'

const args = { ip: '192.0.2.23', intent: 'upgrade-and-verify', artifact_path: '/tmp/test.hpm', artifact_sha256: 'a'.repeat(64), product_version: '1.2.3' }
class RecoveryModel extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const actions = ['lost', 'retry', 'read', 'recover']
    const userIndex = options.messages.findLastIndex(message => message.role === 'user' && message.content.some(block => block.type === 'text' && actions.includes(block.text.trim())))
    const user = options.messages[userIndex]
    const action = user?.content.find(block => block.type === 'text' && actions.includes(block.text.trim()))
    if (action?.type !== 'text') throw new Error('Missing user action in recovery fixture')
    const selected = action.text.trim()
    const toolIndex = options.messages.findLastIndex(message => message.role === 'tool')
    const last = toolIndex > userIndex ? options.messages[toolIndex] : undefined
    if (last?.role === 'tool') {
      if (last.isError !== ['lost', 'retry'].includes(selected)) throw new Error(`Unexpected ${selected} result: ${JSON.stringify(last)}`)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: `RECOVERY_${selected.toUpperCase()}_OK` } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(`${selected}-${options.messages.length}`),
      name: `mcp__openubmc-target-runtime__${selected === 'read' ? 'case_read' : 'upgrade_run'}`,
      arguments: JSON.stringify(selected === 'read' ? {} : args) } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}
export const name = 'recovery-model'
export const inject = ['llm']
/** Register the scripted external model. @param ctx - owning loader context. */
export function apply(ctx: Context): void { ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new RecoveryModel())) }
