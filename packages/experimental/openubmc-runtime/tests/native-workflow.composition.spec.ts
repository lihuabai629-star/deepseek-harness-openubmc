/** Real Skill loading, native human authorization and Runtime Gate recovery through dsh. */
import { glob, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, resolveExampleMode, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/native-workflow/cordis.yml', import.meta.url))
const workflow = process.env.DSH_OPENUBMC_WORKFLOW
const record = z.record(z.string(), z.json())

it.skipIf(workflow === undefined)('loads real stage instructions, asks once for one Run, and records evidence failure after restart', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-native-workflow-'))
  try {
    const packageName = '@deepseek-ai/dsh-experimental-openubmc-runtime'
    const packagePath = join(root, 'packages/experimental/openubmc-runtime')
    const profile = join(cwd, '.dsh/profiles/headless')
    await mkdir(join(profile, 'node_modules/@deepseek-ai'), { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-headless', private: true, type: 'module',
      dependencies: { [packageName]: `link:${packagePath}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } },
    }))
    await symlink(packagePath, join(profile, 'node_modules', packageName), 'dir')
    const run = (args: string[]) => runLoaderSmoke({
      label: 'native openUBMC workflow', cwd, configPath,
      binScript: join(root, 'apps/cli/src/bin.ts'), mode: resolveExampleMode(),
      tsconfigPath: join(root, 'tsconfig.json'), sourceImport: 'tsx/esm',
      binArgs: ['--profile', 'headless', '--patch', configPath, ...args],
      env: { DSH_OPENUBMC_WORKFLOW: workflow!, DSH_RECOVERY_STATE: join(cwd, 'runtime-state'),
        DSH_NATIVE_RUNTIME_WRAPPER: join(root, 'scripts/openubmc/runtime_stdio.py'),
        DSH_NATIVE_RUNTIME_BACKEND: fileURLToPath(new URL('./fixtures/python-runtime.py', import.meta.url)) },
    })
    expect((await run(['Diagnose 192.0.2.10 and prepare a source fix if evidence supports it.'])).stdout)
      .toContain('NATIVE_DIAGNOSIS_GATE_RECORDED')
    const files: string[] = []
    const sessions = join(cwd, '.dsh/sessions')
    for await (const path of glob(`**/session.v${SESSION_FORMAT_VERSION}.jsonl`, { cwd: sessions })) files.push(path)
    expect(files).toHaveLength(1)
    const logPath = join(sessions, files[0]!)
    const initial = await readFile(logPath, 'utf8')
    const header = record.parse(JSON.parse(initial.split('\n')[0]!))
    expect((await run(['--session-id', z.string().parse(header.id), 'CONTINUE_SAME_RUN: finish the diagnosis without inventing missing evidence.'])).stdout)
      .toContain('NATIVE_DIAGNOSIS_GAP_RECORDED')
    const log = await readFile(logPath, 'utf8')
    const events = log.trim().split('\n').map(line => record.parse(JSON.parse(line)))
    const calls = events.filter(event => event.type === 'tool/call').map(event => record.parse(event.data))
    expect(calls.map(call => call.name)).toEqual(['skill', 'mcp__openubmc-target-runtime__observe',
      ...Array<string>(3).fill('mcp__openubmc-target-runtime__execute')])
    expect(calls.slice(2).map(call => record.parse(JSON.parse(z.string().parse(call.arguments))).kind)).toEqual(['start', 'resume', 'respond'])
    expect(events.filter(event => event.type === 'openubmc/authorization')).toHaveLength(1)
    expect((await readFile(join(cwd, 'human-authorization.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(1)
    const turns = events.filter(event => event.type === 'tool/result').flatMap((event) => {
      const meta = record.safeParse(record.parse(event.data).meta)
      const mcp = record.safeParse(meta.success ? meta.data.mcp : undefined)
      return mcp.success && mcp.data.toolName === 'execute' ? [record.parse(mcp.data.structuredContent)] : []
    })
    expect(turns).toHaveLength(3)
    expect(new Set(turns.map(turn => turn.run_id)).size).toBe(1)
    expect(record.parse(turns[1]!.progress).status).toBe('no_progress')
    expect(record.parse(turns[2]!.outcome).status).toBe('failed')
    expect(log).toContain('openubmc:runtime')
    expect(log).toContain('A response_required Gate requests actual work and evidence')
  } finally { await rm(cwd, { recursive: true, force: true }) }
}, LOADER_SMOKE_TEST_TIMEOUT_MS * 2)
