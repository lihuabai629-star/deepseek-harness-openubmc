/** Native Case cards and human read commands through the actual Web composition. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole, webSnapshotMode } from './scaffold.ts'
import { expandOwningTurnProcess, newEnglishPage } from './support.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const scenario = join(root, 'snapshots/web/openubmc-cases')
it('renders failed historical observations and refreshes Case/evidence without model inference', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-openubmc-web-'))
  onTestFinished(() => rm(temp, { recursive: true, force: true }))
  const overlay = join(temp, 'openubmc.yml')
  await writeFile(overlay, JSON.stringify([{ insert: [
    { id: 'case-host', name: '@deepseek-ai/dsh-experimental-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
    { id: 'case-authority', name: '@deepseek-ai/dsh-experimental-openubmc-runtime', config: { serverName: 'openubmc-target-runtime', operationDeadlineSeconds: 10, completionGraceMs: 1000, workflowMaxSteps: 1, evidenceReadLimitBytes: 1024 } },
    { id: 'case-ui', name: '@deepseek-ai/dsh-client-ui-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
    { id: 'case-runtime', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'openubmc-target-runtime', transport: 'stdio', command: process.execPath, args: [join(root, 'apps/web/tests/fixtures/openubmc/runtime.mjs')], sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInMeta: true, structuredContentInText: true, failOnStartupError: true } },
  ] }]))
  const scaffold = await launchWebScaffold({ extraOverlayPath: [join(root, 'apps/web/tests/pin-browse-picker.overlay.yml'), overlay], extraInstallAnchors: [
    join(root, 'packages/experimental/openubmc-cases/package.json'), join(root, 'packages/experimental/openubmc-runtime/package.json'), join(root, 'packages/client/ui-openubmc-cases/package.json'),
  ] })
  onTestFinished(() => scaffold.close())
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const id = await seedSession(scaffold, await readFile(join(scenario, 'session.v4.jsonl'), 'utf8'), 'openubmc-web-case')
  await workspace.attachSession(id)
  await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'openUBMC Case inspection' })
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser)
    const console = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    if (console.pageErrors.length > 0) throw new Error(JSON.stringify(console.pageErrors))
    await page.getByRole('treeitem').filter({ has: page.getByText('openUBMC Case inspection', { exact: true }) }).click().catch(async (error: unknown) => {
      throw new Error(`Case sidebar did not mount: ${JSON.stringify({ pageErrors: console.pageErrors, body: await page.locator('body').innerText() })}`, { cause: error })
    })
    const card = page.locator('[data-openubmc-case]').first()
    await card.waitFor({ state: 'attached', timeout: 20_000 })
    await expandOwningTurnProcess(page, card)
    await card.getByRole('button', { name: /openUBMC Case/ }).click()
    await compareOrRefreshGolden(join(scenario, 'failed.expected.md'), await captureStableAria(page, '[data-openubmc-case]', scaffold.workspaceCwd), webSnapshotMode())
    await card.getByRole('button', { name: 'Refresh Case', exact: true }).click()
    await expect.poll(async () => { const alert = await card.getByRole('alert').textContent({ timeout: 100 }).catch(() => null); if (alert !== null) throw new Error(alert); return page.locator('[data-openubmc-case]').count() }).toBe(3)
    const refreshed = page.locator('[data-openubmc-case]').last()
    await refreshed.getByRole('button', { name: /openUBMC Case/ }).click()
    expect(await refreshed.textContent()).toContain('build.artifact')
    expect(await refreshed.textContent()).toContain('offline-digest')
    await refreshed.getByRole('button', { name: 'Read evidence evidence-1', exact: true }).click()
    await expect.poll(() => page.locator('[data-openubmc-case]').count()).toBe(4)
    await page.locator('[data-openubmc-case]').last().getByRole('button', { name: /openUBMC Case/ }).click()
    expect(await page.locator('[data-openubmc-case]').last().textContent()).toContain('Bounded offline evidence body')
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-openubmc-case]').first().waitFor({ state: 'attached' })
    await expect.poll(() => page.locator('[data-openubmc-case]').count()).toBe(4)
    const restored = page.locator('[data-openubmc-case]').last()
    await restored.getByRole('button', { name: /openUBMC Case/ }).click()
    expect(await restored.textContent()).toContain('Bounded offline evidence body')
    expect(console.pageErrors).toEqual([])
  } finally { await browser.close() }
}, 120_000)
