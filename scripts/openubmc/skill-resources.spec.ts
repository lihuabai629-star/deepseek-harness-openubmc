/** Installed Skill references and scripts share one immutable private generation. @module */
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { prepareSkillResources } from './skill-resources.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-openubmc-skills-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const workflow = join(root, 'package/workflow')
  await mkdir(join(workflow, 'testing/references'), { recursive: true })
  await mkdir(join(workflow, 'testing/scripts'))
  await writeFile(join(workflow, 'testing/SKILL.md'), 'Read [commands](references/commands.md).\n')
  const reference = 'python3 "$HOME/.agents/skills/openubmc-dt-testing/scripts/check.py"\n'
    + '/root/.agents/skills/testing/scripts/check.py\n~/.agents/skills/openubmc-dt-testing/scripts/check.py\n'
    + '$HOME/.agents/skills/openubmc-dt-testing-other/scripts/check.py\n'
  await writeFile(join(workflow, 'testing/references/commands.md'), reference)
  await writeFile(join(workflow, 'testing/scripts/check.py'), 'print("RESOURCE_COMMAND_OK")\n', { mode: 0o700 })
  const state = join(root, 'state')
  const mapping = [{ name: 'openubmc-dt-testing', path: 'testing' }]
  const prepare = () => prepareSkillResources(workflow, state, mapping, join(root, 'unused'))
  return { root, workflow, prepare, reference }
}

it('rewrites nested references through name/path mappings without touching the installed source', async () => {
  const { workflow, prepare, reference } = await fixture()
  const directory = await prepare()
  const commands = await readFile(join(directory, 'testing/references/commands.md'), 'utf8')
  expect(commands.split('\n').slice(0, 3)).toEqual([
    `python3 "${directory}/testing/scripts/check.py"`,
    `${directory}/testing/scripts/check.py`, `${directory}/testing/scripts/check.py`,
  ])
  expect(commands).toContain('$HOME/.agents/skills/openubmc-dt-testing-other/')
  expect(await readFile(join(workflow, 'testing/references/commands.md'), 'utf8')).toBe(reference)
  expect(await prepare()).toBe(directory)
  if (process.platform !== 'win32') {
    expect((await stat(join(directory, 'testing/scripts/check.py'))).mode & 0o777).toBe(0o700)
    expect(execFileSync('python3', ['-B', join(directory, 'testing/scripts/check.py')], { encoding: 'utf8' })).toBe('RESOURCE_COMMAND_OK\n')
  }
})

it('publishes one complete generation for concurrent mounts and retains earlier package resources', async () => {
  const { root, workflow, prepare } = await fixture()
  const directories = await Promise.all([prepare(), prepare()])
  expect(directories[0]).toBe(directories[1])
  expect(await readdir(join(root, 'state/skill-resources'))).toEqual([directories[0].split(/[\\/]/u).at(-1)])
  await writeFile(join(workflow, 'testing/scripts/check.py'), 'print("UPDATED")\n')
  const updated = await prepare()
  expect(updated).not.toBe(directories[0])
  expect(await readFile(join(directories[0], 'testing/scripts/check.py'), 'utf8')).toContain('RESOURCE_COMMAND_OK')
})

it('rejects modified private resource bytes instead of silently replacing them', async () => {
  const { prepare } = await fixture()
  const directory = await prepare()
  await writeFile(join(directory, 'testing/scripts/check.py'), 'changed\n')
  await expect(prepare()).rejects.toThrow('Skill resource changed')
})

it.skipIf(process.platform === 'win32')('rejects a resource that lost its executable permission', async () => {
  const { prepare } = await fixture()
  const directory = await prepare()
  await chmod(join(directory, 'testing/scripts/check.py'), 0o600)
  await expect(prepare()).rejects.toThrow('Skill resource changed')
})
