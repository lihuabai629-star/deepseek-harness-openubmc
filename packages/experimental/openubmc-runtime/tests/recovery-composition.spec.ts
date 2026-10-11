/** Recovery through actual source/built profiles and the authoritative Python Runtime. */
import { glob, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { runLoaderSmoke, LOADER_SMOKE_TEST_TIMEOUT_MS } from '@deepseek-ai/dsh-loader-smoke'
import { SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))
const workflow = process.env.DSH_OPENUBMC_WORKFLOW
it.skipIf(workflow === undefined).each(['source', 'built', 'python'] as const)('persists recovery and controls original-operation replay through %s dsh', async (mode) => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-recovery-app-'))
  try {
    const profile = join(cwd, '.dsh/profiles/headless')
    const packageName = '@deepseek-ai/dsh-experimental-openubmc-runtime'
    const packagePath = join(root, 'packages/experimental/openubmc-runtime')
    await mkdir(join(profile, 'node_modules/@deepseek-ai'), { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'recovery-profile', private: true, type: 'module',
      dependencies: { [packageName]: `link:${packagePath}` }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } } }))
    await symlink(packagePath, join(profile, 'node_modules', packageName), 'dir')
    let model = join(fixtures, 'recovery-model.ts')
    if (mode === 'built') {
      const source = (await readFile(model, 'utf8')).replace("'@deepseek-ai/dsh-llm'", JSON.stringify(pathToFileURL(join(root, 'packages/llm/llm/lib/index.js')).href))
      model = join(cwd, 'model.mjs')
      await writeFile(model, transpileModule(source, {
        compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
      }).outputText)
    }
    const patch = join(cwd, 'recovery.patch.yml')
    await writeFile(patch, JSON.stringify([
      { id: 'session-persistence-jsonl', config: { root: join(cwd, '.dsh/sessions'), compression: 'none' } },
      { id: 'llm-deepseek', disabled: true },
      { insert: [
        { id: 'model', name: model },
        { id: 'policy', name: packageName, config: { serverName: 'openubmc-target-runtime', operationDeadlineSeconds: 1, completionGraceMs: 100, workflowMaxSteps: 1, evidenceReadLimitBytes: 65536 } },
        { id: 'runtime', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'openubmc-target-runtime', transport: 'stdio',
          command: mode === 'python' ? 'python3' : process.execPath,
          args: mode === 'python' ? [join(root, 'scripts/openubmc/runtime_stdio.py'), '--entry', join(fixtures, 'python-runtime.py')] : [join(fixtures, 'recovery-runtime.mjs')],
          env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: cwd, DSH_RECOVERY_MODE: 'disconnect', DSH_RECOVERY_MARKER: join(cwd, 'attempts.txt') },
          sessionIdMetadataKey: 'taskId', requiredToolCallPolicies: ['openubmc-session-authority'], structuredContentInMeta: true, structuredContentInText: true,
          failOnStartupError: true, toolCallTimeoutMs: 1200, reconnect: { enabled: false } } },
      ] },
    ]))
    const run = (args: string[], complete = false) => runLoaderSmoke({ label: 'openUBMC recovery app', cwd, configPath: patch,
      binScript: join(root, 'apps/cli/src/bin.ts'), mode: mode === 'built' ? 'lib' : 'src', tsconfigPath: join(root, 'tsconfig.json'),
      ...(mode === 'built' ? {} : { sourceImport: 'tsx/esm' }), binArgs: ['--profile', 'headless', '--patch', patch, ...args],
      env: complete ? { DSH_RECOVERY_MODE: 'complete' } : {},
    })
    // Create the Session without a target call, then issue the native grant.
    expect((await run(['/target-authorize revoke'])).stdout).toContain('Target execution authority revoked')
    const files: string[] = []
    for await (const file of glob(`**/session.v${SESSION_FORMAT_VERSION}.jsonl`, { cwd: join(cwd, '.dsh/sessions') })) files.push(file)
    expect(files).toHaveLength(1)
    const logPath = join(cwd, '.dsh/sessions', files[0]!)
    const header = JSON.parse((await readFile(logPath, 'utf8')).split('\n')[0]!) as SessionHeader
    const sessionArgs = ['--session-id', header.id]
    await run([...sessionArgs, '/target-authorize upgrade_run'])
    expect((await run([...sessionArgs, 'lost'])).stdout).toContain('RECOVERY_LOST_OK')
    expect((await run([...sessionArgs, 'retry'])).stdout).toContain('RECOVERY_RETRY_OK')
    expect((await run([...sessionArgs, 'read'])).stdout).toContain('RECOVERY_READ_OK')
    if (mode === 'python') {
      const calls = (await readFile(logPath, 'utf8')).split('\n').filter(line => line.includes('"type":"tool/call"')).map(line => JSON.parse(line) as { data: { callId: string } })
      const original = calls.find(call => call.data.callId.startsWith('lost-'))!.data.callId
      expect((await run([...sessionArgs, `/target-reconcile ${original}`])).stdout).toContain('Reconciliation authorized once')
    } else {
      // The fixture's next process returns completed Case facts; recovery still requires a new grant.
      const config = JSON.parse(await readFile(patch, 'utf8')) as { insert: { config: { env: { DSH_RECOVERY_MODE: string } } }[] }[]
      config[2]!.insert[2]!.config.env.DSH_RECOVERY_MODE = 'complete'
      await writeFile(patch, JSON.stringify(config))
      await run([...sessionArgs, '/target-authorize upgrade_run'])
    }
    expect((await run([...sessionArgs, 'recover'], true)).stdout).toContain('RECOVERY_RECOVER_OK')
    expect((await readFile(join(cwd, 'attempts.txt'), 'utf8')).split('\n').filter(Boolean)).toHaveLength(2)
    const persisted = await readFile(logPath, 'utf8')
    expect(persisted).toContain('current-session human grant')
    if (mode === 'python') {
      expect(persisted).toContain('mutation_outcome_unknown')
      await run([...sessionArgs, 'read'])
      expect((await run([...sessionArgs, '/target-authorize upgrade_run'])).stdout).toContain('Target execution authorized')
    }
  } finally { await rm(cwd, { recursive: true, force: true }) }
}, LOADER_SMOKE_TEST_TIMEOUT_MS * 4)
