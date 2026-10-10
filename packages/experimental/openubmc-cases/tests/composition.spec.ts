/** Native Case queries from source and built dsh profiles, across process restarts. */
import { glob, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLoaderSmoke, LOADER_SMOKE_TEST_TIMEOUT_MS } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const patch = fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url))

it('runs the failure, native query and persisted resume path through dsh', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-native-cases-'))
  try {
    const profile = join(cwd, '.dsh/profiles/headless')
    const packageName = '@deepseek-ai/dsh-experimental-openubmc-cases'
    const packagePath = join(root, 'packages/experimental/openubmc-cases')
    await mkdir(join(profile, 'node_modules/@deepseek-ai'), { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-headless', private: true, type: 'module',
      dependencies: { [packageName]: `link:${packagePath}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } },
    }))
    await symlink(packagePath, join(profile, 'node_modules', packageName), 'dir')
    const run = (args: string[]) => runLoaderSmoke({
      label: 'native openUBMC Cases', cwd, configPath: patch,
      binScript: join(root, 'apps/cli/src/bin.ts'), sourceImport: 'tsx/esm', tsconfigPath: join(root, 'tsconfig.json'),
      binArgs: ['--profile', 'headless', '--patch', patch, ...args],
      env: { DSH_CASE_RUNTIME_FIXTURE: join(root, 'snapshots/session/openubmc-recovery/workspace/runtime.mjs') },
    })
    expect((await run(['observe'])).stdout).toContain('CASE_COMMAND_OK')
    const sessionsDir = join(cwd, '.dsh/sessions')
    const files: string[] = []
    for await (const file of glob(`**/session.v${SESSION_FORMAT_VERSION}.jsonl`, { cwd: sessionsDir })) files.push(file)
    expect(files, JSON.stringify(await readdir(sessionsDir, { recursive: true }))).toHaveLength(1)
    const logPath = join(sessionsDir, files[0]!)
    const log = await readFile(logPath, 'utf8')
    const header = JSON.parse(log.split('\n')[0]!) as SessionHeader
    const sessionId = header.id
    expect(log).toContain('"structuredContent":{"case_id":"case-7","status":"mutation_outcome_unknown"')
    expect(log).toContain('"name":"case"')
    expect((await run(['--session-id', sessionId, 'resume'])).stdout).toContain('CASE_RESUMED_OK')
    const after = await readFile(logPath, 'utf8')
    const results = after.split('\n').filter(line => line.includes('"type":"tool/result"'))
    expect(results).toHaveLength(2)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}, LOADER_SMOKE_TEST_TIMEOUT_MS * 2)
