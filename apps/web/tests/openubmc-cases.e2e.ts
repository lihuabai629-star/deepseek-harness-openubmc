/** Native Run and observation receipt cards through the actual Web composition. */
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
it('renders failed Run recovery, Gate bindings and incomplete observations after reload', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-openubmc-web-'))
  onTestFinished(() => rm(temp, { recursive: true, force: true }))
  const overlay = join(temp, 'openubmc.yml')
  await writeFile(overlay, JSON.stringify([{ insert: [
    { id: 'case-host', name: '@deepseek-ai/dsh-experimental-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
    { id: 'case-ui', name: '@deepseek-ai/dsh-client-ui-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
  ] }]))
  const scaffold = await launchWebScaffold({ extraOverlayPath: [join(root, 'apps/web/tests/pin-browse-picker.overlay.yml'), overlay], extraInstallAnchors: [
    join(root, 'packages/experimental/openubmc-cases/package.json'), join(root, 'packages/client/ui-openubmc-cases/package.json'),
  ] })
  onTestFinished(() => scaffold.close())
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const id = await seedSession(scaffold, await readFile(join(scenario, 'session.v4.jsonl'), 'utf8'), 'openubmc-web-agent')
  await workspace.attachSession(id)
  await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'openUBMC Run inspection' })
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser)
    const console = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('treeitem').filter({ has: page.getByText('openUBMC Run inspection', { exact: true }) }).click()
    const card = page.locator('[data-openubmc-agent]').first()
    await card.waitFor({ state: 'attached', timeout: 20_000 })
    await expandOwningTurnProcess(page, card)
    await card.getByRole('button', { name: /openUBMC Run/ }).click()
    await compareOrRefreshGolden(join(scenario, 'failed.expected.md'), await captureStableAria(page, '[data-openubmc-agent]', scaffold.workspaceCwd), webSnapshotMode())
    expect(await card.textContent()).toContain('effect_outcome_unknown')
    expect(await card.textContent()).toContain('gate-web')
    expect(await card.textContent()).toContain('sha256:offline-schema')
    expect(await card.getByRole('button').count()).toBe(1)
    const receipt = page.locator('[data-openubmc-agent]').last()
    await receipt.getByRole('button', { name: /Observation receipt/ }).click()
    expect(await receipt.textContent()).toContain('one selector was not checked')
    expect(await receipt.textContent()).toContain('Coverage')
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-openubmc-agent]').first().waitFor({ state: 'attached' })
    await expect.poll(() => page.locator('[data-openubmc-agent]').count()).toBe(2)
    const restored = page.locator('[data-openubmc-agent]').first()
    await expandOwningTurnProcess(page, restored)
    await restored.getByRole('button', { name: /openUBMC Run/ }).click()
    expect(await restored.textContent()).toContain('incident-web')
    expect(console.pageErrors).toEqual([])
  } finally { await browser.close() }
}, 120_000)
