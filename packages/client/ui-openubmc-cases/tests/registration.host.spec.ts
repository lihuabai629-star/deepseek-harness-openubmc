import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { Config, apply as hostApply } from '../src/index.ts'

it('publishes trusted Host settings and removes the page listener on disposal', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const config = Config({ serverName: 'runtime' })
  expect(() => Config({ serverName: 'invalid/name' })).toThrow()
  const fiber = ctx.plugin({ apply: hostApply }, config)
  await fiber.await()
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  expect(table).toEqual([{ kind: 'global', name: '__DSH_OPENUBMC_CASES_CONFIG__', value: config }])
  await fiber.dispose()
  const after: typeof table = []
  ctx.emit('webserver/index-inject', after)
  expect(after).toEqual([])
})
