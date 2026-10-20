/** Portable release resources and rejected workflow source inputs. @module */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { stageWorkflow } from './pack.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(path = 'testing') {
  const root = await mkdtemp(join(tmpdir(), 'openubmc-payload-test-'))
  roots.push(root)
  const workflow = join(root, 'source')
  await mkdir(join(workflow, 'testing/scripts'), { recursive: true })
  await writeFile(join(workflow, 'workflow.json'), JSON.stringify({ version: 'fixture', profiles: { full: ['openubmc-dt-testing'] },
    skills: [{ name: 'openubmc-dt-testing', path }] }))
  await writeFile(join(workflow, 'testing/SKILL.md'), '---\nname: openubmc-dt-testing\ndescription: Fixture\n---\nInstructions\n')
  await writeFile(join(workflow, 'testing/scripts/helper.py'), 'fixture = True\n')
  execFileSync('git', ['init', '-q', workflow])
  execFileSync('git', ['-C', workflow, 'add', '.'])
  execFileSync('git', ['-C', workflow, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Fixture'])
  return { root, workflow, target: join(root, 'payload') }
}

it('keeps the logical Skill mapping and tracked support files without copying local files', async () => {
  const { workflow, target } = await fixture()
  await writeFile(join(workflow, 'testing/scripts/local.env'), 'not a release resource\n')
  const result = await stageWorkflow(workflow, target)
  expect(result.skills).toEqual([{ name: 'openubmc-dt-testing', path: 'testing' }])
  expect(await readFile(join(target, 'testing/scripts/helper.py'), 'utf8')).toBe('fixture = True\n')
  await expect(readFile(join(target, 'testing/scripts/local.env'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['../outside', '/outside'])('rejects a manifest path outside its checkout: %s', async (path) => {
  const { workflow, target } = await fixture(path)
  await expect(stageWorkflow(workflow, target)).rejects.toThrow('escapes its checkout')
})

it('rejects changes to tracked resources before making a release', async () => {
  const { workflow, target } = await fixture()
  await writeFile(join(workflow, 'testing/scripts/helper.py'), 'modified = True\n')
  await expect(stageWorkflow(workflow, target)).rejects.toThrow('uncommitted tracked changes')
})

it.skipIf(process.platform === 'win32')('rejects tracked links instead of including external file contents', async () => {
  const { root, workflow, target } = await fixture()
  const outside = join(root, 'outside')
  await writeFile(outside, 'private fixture\n')
  await symlink(outside, join(workflow, 'testing/scripts/link'))
  execFileSync('git', ['-C', workflow, 'add', '.'])
  execFileSync('git', ['-C', workflow, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Link fixture'])
  await expect(stageWorkflow(workflow, target)).rejects.toThrow('must be regular files')
})
