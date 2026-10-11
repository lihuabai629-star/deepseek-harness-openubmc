/** Native Case queries from source and built dsh profiles, across process restarts. */
import { glob, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { runLoaderSmoke, LOADER_SMOKE_TEST_TIMEOUT_MS } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const patch = fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url))

it.each(['source', 'built'] as const)('runs denial, human authorization and persisted resume through %s dsh', async (mode) => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-runtime-authority-'))
  try {
    const profile = join(cwd, '.dsh/profiles/headless')
    const packageName = '@deepseek-ai/dsh-experimental-openubmc-runtime'
    const packagePath = join(root, 'packages/experimental/openubmc-runtime')
    await mkdir(join(profile, 'node_modules/@deepseek-ai'), { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-headless', private: true, type: 'module',
      dependencies: { [packageName]: `link:${packagePath}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } },
    }))
    await symlink(packagePath, join(profile, 'node_modules', packageName), 'dir')
    let configPath = patch
    if (mode === 'built') {
      const fixture = fileURLToPath(new URL('./fixtures/model.ts', import.meta.url))
      const source = (await readFile(fixture, 'utf8')).replace("'@deepseek-ai/dsh-llm'", JSON.stringify(pathToFileURL(join(root, 'packages/llm/llm/lib/index.js')).href))
      await writeFile(join(cwd, 'model.mjs'), transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext } }).outputText)
      configPath = join(cwd, 'authority.patch.yml')
      await writeFile(configPath, (await readFile(patch, 'utf8')).replace("'./model.ts'", JSON.stringify(join(cwd, 'model.mjs'))))
    }
    const run = (args: string[]) => runLoaderSmoke({
      label: 'openUBMC execution authority', cwd, configPath,
      binScript: join(root, 'apps/cli/src/bin.ts'), mode: mode === 'source' ? 'src' : 'lib',
      tsconfigPath: join(root, 'tsconfig.json'),
      ...(mode === 'source' ? { sourceImport: 'tsx/esm' } : {}),
      binArgs: ['--profile', 'headless', '--patch', configPath, ...args],
      env: { DSH_CASE_RUNTIME_FIXTURE: fileURLToPath(new URL('./fixtures/runtime.mjs', import.meta.url)) },
    })
    expect((await run(['observe'])).stdout).toContain('AUTHORITY_DENIAL_OK')
    const sessionsDir = join(cwd, '.dsh/sessions')
    const files: string[] = []
    for await (const file of glob(`**/session.v${SESSION_FORMAT_VERSION}.jsonl`, { cwd: sessionsDir })) files.push(file)
    expect(files, JSON.stringify(await readdir(sessionsDir, { recursive: true }))).toHaveLength(1)
    const logPath = join(sessionsDir, files[0]!)
    const log = await readFile(logPath, 'utf8')
    const header = JSON.parse(log.split('\n')[0]!) as SessionHeader
    const sessionId = header.id
    expect(log).toContain('current-session human grant')
    expect(log).toContain('does not belong')
    expect((await run(['--session-id', sessionId, 'resume'])).stdout).toContain('AUTHORITY_RESUMED_OK')
    const after = await readFile(logPath, 'utf8')
    const results = after.split('\n').filter(line => line.includes('"type":"tool/result"'))
    expect(results).toHaveLength(2)
    const grant = await run(['--session-id', sessionId, '--json', '/target-authorize debug_run'])
    expect(grant.stdout).toContain('Target execution authorized for this Session: debug_run.')
    expect(grant.stdout).not.toContain('turn_start')
    expect((await run(['--session-id', sessionId, 'allowed'])).stdout).toContain('AUTHORITY_ALLOWED_OK')
    expect((await run(['--session-id', sessionId, 'allowed again'])).stdout).toContain('AUTHORITY_ALLOWED_OK')
    const granted = await readFile(logPath, 'utf8')
    expect(granted).toContain('\"name\":\"target-authorize\"')
    expect(granted).toContain('OWNED_EXECUTION_OK')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}, LOADER_SMOKE_TEST_TIMEOUT_MS * 2)
