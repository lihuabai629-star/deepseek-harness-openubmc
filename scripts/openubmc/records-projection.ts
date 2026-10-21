/** Host-only delivery and observed usage projection over ordinary Session events. @module */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const stateSchema = z.object({ inherited: z.number(), overflow: z.boolean(),
  measurements: z.array(z.object({ invocation_ref: z.string(), run_ref: z.null(), usage: z.object({
    input_tokens: z.number().optional(), output_tokens: z.number().optional(), cached_tokens: z.number().optional(),
  }) })),
  final: z.object({ seq: z.number(), timestamp: z.number(), text: z.string() }).nullable(),
})
type State = z.infer<typeof stateSchema>
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Bounded observed settlements; never a complete provider invocation inventory. */
    'openubmc/host-records': State
  }
}

/** Replayable observations without retaining message or tool payloads in private records. */
export const recordsProjection: ProjectionDefinition<'openubmc/host-records'> = {
  key: 'openubmc/host-records', stateVersion: 1, stateSchema,
  init: (_header, inherited) => ({ inherited, overflow: false, measurements: [], final: null }),
  apply: (state, event) => {
    if (event.seq < state.inherited) return state
    if (event.type === 'turn/start') return { ...state, final: null }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
    const usage = event.type === 'assistant/message' ? event.data.usage : undefined
    const measurements = state.measurements.length >= 256 ? state.measurements : [...state.measurements, {
      invocation_ref: `dsh:settlement:${event.seq}`, run_ref: null,
      usage: usage === undefined ? {} : { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
        ...(usage.cacheReadTokens === undefined ? {} : { cached_tokens: usage.cacheReadTokens }) },
    }]
    let final: State['final'] = null
    if (event.type === 'assistant/message' && !event.data.interrupted
      && !event.data.message.content.some(block => block.type === 'tool-call')) {
      const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
      if (Buffer.byteLength(text) <= 64 * 1024) final = { seq: event.seq, timestamp: event.time, text }
    }
    return { ...state, measurements, overflow: state.overflow || state.measurements.length >= 256, final }
  },
}
