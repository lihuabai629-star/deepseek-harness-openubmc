/** SDK notification fixture for a native Agent observation. */
export const inject = ['agents', 'commands', 'tools']
/** Record an offline native observation before inference. @param ctx - fixture composition. */
export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({ definitionId: 'offline-observe-fixture', name: 'offline-observe', description: 'Read the offline observation fixture',
    handler: async invocation => {
      const result = await ctx.tools.execute({ name: 'mcp__openubmc-target-runtime__observe', callId: 'sdk-observe', agent: invocation.agent, signal: invocation.signal,
        arguments: { target: '192.0.2.10', selectors: [{ id: 'ssh', kind: 'capability', names: ['ssh'] }] } })
      if (result.isError) throw new Error(JSON.stringify(result.content))
      invocation.agent.session.append('openubmc/inspection', { commandId: invocation.commandId, message: { isError: result.isError }, ...(result.meta === undefined ? {} : { meta: result.meta }) })
      return { kind: result.isError ? 'error' : 'success', text: 'Offline observation recorded.' }
    } }))
  ctx.on('agent/created', async ({ agent }) => { await ctx.commands.execute(agent, '/offline-observe', [], new AbortController().signal) })
}
