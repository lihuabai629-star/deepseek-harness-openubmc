/** Native workflow guidance derives only recorded Session authority and results. */
import { expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { OpenUbmcRunId } from '@deepseek-ai/dsh-experimental-openubmc-cases/types'
import { renderOpenUbmcRuntimeContext } from '../src/guidance.ts'
import { bench, response } from './harness.ts'

it('restores guidance from recorded settlements and disposes both prompt registrations', async () => {
  const b = await bench()
  try {
    const assembly = () => b.ctx.systemPrompt.assemble({ scope: b.agent, agent: b.agent })
    expect((await b.ctx.systemPrompt.assemble()).contexts).toEqual([{ name: 'openubmc:runtime', text: '' }])
    expect((await assembly()).sections.find(section => section.name === 'openubmc:workflow')?.text)
      .toContain('progress.status is no_progress')
    expect((await assembly()).contexts.find(context => context.name === 'openubmc:runtime')?.text)
      .toContain('execute authorization absent')
    await b.command('/target-authorize execute 192.0.2.10 diagnose-and-fix source-only')
    expect((await assembly()).contexts.find(context => context.name === 'openubmc:runtime')?.text)
      .toContain('execute authorization granted within its recorded scope')
    await b.command('/target-authorize execute')
    b.register('execute', async () => response())
    await b.execute('execute', { kind: 'start', intent: 'diagnosis-only', target: '192.0.2.10' })
    const current = (await assembly()).contexts.find(context => context.name === 'openubmc:runtime')?.text
    expect(current).toContain('owned Runs 1; open Gates 1; Incidents 0')
    const restarted = await bench(b.session.snapshotEvents())
    try {
      expect((await restarted.ctx.systemPrompt.assemble({ scope: restarted.agent, agent: restarted.agent })).contexts)
        .toContainEqual({ name: 'openubmc:runtime', text: current })
      const fork = restarted.ctx.sessions.fork(restarted.session, undefined, SessionId('guidance-fork'))
      const forkAgent = { ...restarted.agent, id: fork.id, session: fork }
      const inherited = (await restarted.ctx.systemPrompt.assemble({ scope: forkAgent, agent: forkAgent })).contexts
      expect(inherited.find(context => context.name === 'openubmc:runtime')?.text).toContain('execute authorization absent')
      expect(inherited.find(context => context.name === 'openubmc:runtime')?.text).toContain('owned Runs 0')
    } finally { await restarted.ctx.fiber.dispose() }
    await b.fiber.dispose()
    const unloaded = await assembly()
    expect(unloaded.sections.some(section => section.name === 'openubmc:workflow')).toBe(false)
    expect(unloaded.contexts.some(context => context.name === 'openubmc:runtime')).toBe(false)
  } finally { await b.ctx.fiber.dispose() }
})

it('keeps context bounded when recorded Runs contain large identifiers and evidence', async () => {
  const b = await bench()
  try {
    const state = b.ctx.sessionProjections.stateOf(b.session, 'openubmc/runtime')!
    const largeId = brandString<OpenUbmcRunId>('r'.repeat(100_000))
    const text = renderOpenUbmcRuntimeContext({ ...state,
      runs: { [largeId]: { gate: { input_schema: { description: 'e'.repeat(100_000) } }, incident: { id: 'i'.repeat(100_000) } } },
      pendingCalls: { [ToolCallId('pending')]: { arguments: { kind: 'start' }, operationId: ToolCallId('pending') } },
      uncertainCalls: { [ToolCallId('unknown')]: { arguments: { run_id: largeId }, operationId: ToolCallId('unknown') } },
    })
    expect(text).toContain('pending calls 1; uncertain calls 1; owned Runs 1; open Gates 1; Incidents 1')
    expect(text).toContain('original operation identity')
    expect(text).toContain('follow its recovery action')
    expect(text.length).toBeLessThan(1000)
    expect(text).not.toContain(largeId)
    expect(text).not.toContain('e'.repeat(100))
  } finally { await b.ctx.fiber.dispose() }
})

it('refuses an Agent prompt when its Session authority projection is unavailable', async () => {
  const b = await bench()
  const missing = vi.spyOn(b.ctx.sessionProjections, 'stateOf').mockReturnValue(undefined)
  try {
    await expect(b.ctx.systemPrompt.assemble({ scope: b.agent, agent: b.agent }))
      .rejects.toThrow('openUBMC Session authority is unavailable.')
    expect(missing).toHaveBeenCalledWith(b.session, 'openubmc/runtime')
  } finally {
    missing.mockRestore()
    await b.ctx.fiber.dispose()
  }
})
