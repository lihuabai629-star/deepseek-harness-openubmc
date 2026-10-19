/** Native Run and observation receipt cards through the actual Web composition. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, readPersistedEvents, seedSession, watchConsole, webSnapshotMode } from './scaffold.ts'
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

it('authorizes, reconciles and submits the current Gate through native Host commands without model inference', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-openubmc-controls-'))
  onTestFinished(() => rm(temp, { recursive: true, force: true }))
  const calls = join(temp, 'calls.jsonl')
  await writeFile(calls, '')
  const overlay = join(temp, 'controls.yml')
  await writeFile(overlay, JSON.stringify([{ insert: [
    { id: 'case-host', name: '@deepseek-ai/dsh-experimental-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
    { id: 'case-ui', name: '@deepseek-ai/dsh-client-ui-openubmc-cases', config: { serverName: 'openubmc-target-runtime' } },
    { id: 'runtime-authority', name: '@deepseek-ai/dsh-experimental-openubmc-runtime', config: {
      serverName: 'openubmc-target-runtime', operationDeadlineSeconds: 10, observationDeadlineSeconds: 10, completionGraceMs: 1000,
    } },
    { id: 'runtime-mcp', name: '@deepseek-ai/dsh-mcp-client', config: {
      serverName: 'openubmc-target-runtime', transport: 'stdio', command: process.execPath,
      args: [join(root, 'apps/web/tests/fixtures/openubmc/controls.mjs'), calls], sessionIdMetadataKey: 'taskId',
      requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInMeta: true, structuredContentInText: true, failOnStartupError: true,
    } },
  ] }]))
  const scaffold = await launchWebScaffold({ extraOverlayPath: [join(root, 'apps/web/tests/pin-browse-picker.overlay.yml'), overlay], extraInstallAnchors: [
    join(root, 'packages/experimental/openubmc-cases/package.json'), join(root, 'packages/client/ui-openubmc-cases/package.json'),
    join(root, 'packages/experimental/openubmc-runtime/package.json'),
  ] })
  onTestFinished(() => scaffold.close())
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const id = await seedSession(scaffold, await readFile(join(scenario, 'session.v4.jsonl'), 'utf8'), 'openubmc-web-controls')
  await workspace.attachSession(id)
  await scaffold.ctx.sessionController.rename({ sessionId: id, title: 'openUBMC controls' })
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser)
    const console = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('treeitem').filter({ has: page.getByText('openUBMC controls', { exact: true }) }).click()
    const original = page.locator('[data-run-id="run-web"]').first()
    await original.waitFor({ state: 'attached', timeout: 20_000 })
    await expandOwningTurnProcess(page, original)
    await original.getByRole('button', { name: /openUBMC Run/ }).click()
    expect(await original.getByRole('button', { name: 'Reconcile execution' }).isDisabled()).toBe(true)
    expect(await readFile(calls, 'utf8')).toBe('')
    await original.getByRole('button', { name: 'Authorize this Session' }).click()
    await expect.poll(async () => {
      const events = await readPersistedEvents(scaffold, id)
      return events.filter(event => event.type === 'command/done').map(event => event.data)
    }).toMatchObject([{ kind: 'success' }])
    await expect.poll(() => original.getByRole('button', { name: 'Reconcile execution' }).isEnabled()).toBe(true)
    await original.getByRole('button', { name: 'Reconcile execution' }).click()
    const current = page.locator('[data-run-id="run-web"]').last()
    await expect.poll(() => page.locator('[data-run-id="run-web"]').count()).toBe(2)
    await current.getByRole('button', { name: /openUBMC Run/ }).click()
    await current.getByLabel('Result summary').fill('Explicit diagnosis')
    await current.getByLabel('root_cause').fill('Observed identifier mismatch')
    await current.getByLabel('evidence_ids').fill('evidence-web')
    await compareOrRefreshGolden(join(root, 'apps/web/tests/expected/openubmc-gate-form.md'), await captureStableAria(page, '[data-openubmc-gate]', scaffold.workspaceCwd), webSnapshotMode())
    await current.getByRole('button', { name: 'Submit phase result' }).click()
    await expect.poll(() => page.locator('[data-run-id="run-web"]').count()).toBe(3)
    const dispatched = (await readFile(calls, 'utf8')).trim().split('\n').map((line): unknown => JSON.parse(line))
    expect(dispatched).toMatchObject([
      { kind: 'control', command: 'reconcile', run_id: 'run-web' },
      { kind: 'respond', run_id: 'run-web', gate_id: 'gate-form', gate_version: 3, schema_digest: 'sha256:form', submission_id: 'submission-form',
        response: { status: 'completed', summary: 'Explicit diagnosis', payload: { root_cause: 'Observed identifier mismatch', evidence_ids: ['evidence-web'] } } },
    ])
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-run-id="run-web"]').last().waitFor({ state: 'attached' })
    expect((await readFile(calls, 'utf8')).trim().split('\n')).toHaveLength(2)
    expect(console.pageErrors).toEqual([])
  } finally { await browser.close() }
}, 120_000)
