/** Native human inspection fixture for SDK notification projection. */
export const inject = ['agents', 'commands']
/** Invoke a native read before the model turn. @param ctx - fixture composition. */
export function apply(ctx) {
  ctx.on('agent/created', async ({ agent }) => { await ctx.commands.execute(agent, '/case-refresh', [], new AbortController().signal) })
}
