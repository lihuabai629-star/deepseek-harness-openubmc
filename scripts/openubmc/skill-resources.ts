/** Private, immutable Skill resources with installation-relative command paths. @module */
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** Logical Skill names and their workflow-relative directories. */
export interface SkillMapping {
  /** Name exposed in the DSH Skill catalog. */
  name: string
  /** Resource directory relative to the packaged workflow. */
  path: string
}

/**
 * Materialize a verified resource generation outside the installed package.
 * Every Markdown file uses the same generation's paths; script bytes are unchanged.
 * Existing generations are verified and never overwritten, including during concurrent mounts.
 * @param workflow - Integrity-checked packaged workflow directory.
 * @param stateDir - Private installation state directory.
 * @param skills - Manifest-selected logical names and physical paths.
 * @param environmentSkill - DSH-owned replacement for the environment instructions.
 * @returns Absolute root retained across plugin disposal and package updates.
 */
export async function prepareSkillResources(
  workflow: string, stateDir: string, skills: readonly SkillMapping[], environmentSkill: string,
): Promise<string> {
  const files = new Map<string, Buffer>()
  const executable = new Set<string>()
  const collect = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name
      if (entry.isDirectory()) await collect(join(directory, entry.name), name + '/')
      else if (entry.isFile()) {
        files.set(name, await readFile(join(directory, entry.name)))
        if ((await lstat(join(directory, entry.name))).mode & 0o100) executable.add(name)
      }
      else throw new Error(`openUBMC Skill resource must be a regular file: ${name}`)
    }
  }
  await collect(workflow, '')
  const environment = skills.find(skill => skill.name === 'openubmc-environment-setup')
  if (environment !== undefined) files.set(environment.path + '/SKILL.md', await readFile(environmentSkill))
  const hash = createHash('sha256').update('dsh-openubmc/skill-resources/v1\0')
    .update(resolve(workflow)).update(JSON.stringify(skills))
  for (const [name, bytes] of [...files].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    hash.update(`\0${name}\0${executable.has(name)}\0`).update(bytes)
  }
  const parent = join(stateDir, 'skill-resources')
  const destination = join(parent, hash.digest('hex'))
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const aliases = skills.flatMap(skill => [skill.name, skill.path].map(name => [name, join(destination, skill.path)] as const))
  const paths = new Map(aliases)
  const pattern = new RegExp('(?:/root/\\.agents/skills/|\\$HOME/\\.agents/skills/|~/\\.agents/skills/)('
    + [...paths.keys()].sort((left, right) => right.length - left.length).map(escape).join('|') + ')(?![\\w-])', 'gu')
  const rewrite = (body: string) => body.replace(pattern, (_match: string, alias: string) => {
    const path = paths.get(alias)
    if (path === undefined) throw new Error('openUBMC Skill alias is unavailable.')
    return path
  })
  const generated = new Map([...files].map(([name, bytes]) => [name, name.endsWith('.md')
    ? Buffer.from(rewrite(bytes.toString('utf8'))) : bytes]))
  const verify = async () => {
    if (!(await lstat(destination)).isDirectory() || (await lstat(destination)).isSymbolicLink()) {
      throw new Error('openUBMC Skill resource directory is invalid; restore the private resource generation.')
    }
    for (const [name, bytes] of generated) {
      const parents = name.split('/').slice(0, -1)
      for (let index = 1; index <= parents.length; index++) {
        const status = await lstat(join(destination, ...parents.slice(0, index)))
        if (!status.isDirectory() || status.isSymbolicLink()) throw new Error('openUBMC Skill resource contains a directory link.')
      }
      const path = join(destination, name)
      const status = await lstat(path)
      if (!status.isFile() || Boolean(status.mode & 0o100) !== executable.has(name) || !(await readFile(path)).equals(bytes)) {
        throw new Error(`openUBMC Skill resource changed: ${name}; restore the private resource generation.`)
      }
    }
  }
  await mkdir(parent, { recursive: true, mode: 0o700 })
  try {
    await lstat(destination)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    const staging = await mkdtemp(join(parent, '.pending-'))
    try {
      for (const [name, bytes] of generated) {
        const path = join(staging, name)
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await writeFile(path, bytes, { mode: executable.has(name) ? 0o700 : 0o600 })
      }
      try { await rename(staging, destination) } catch (renameError) {
        if (!(renameError instanceof Error && 'code' in renameError
          && ['EEXIST', 'ENOTEMPTY'].includes(String(renameError.code)))) throw renameError
      }
    } finally { await rm(staging, { recursive: true, force: true }) }
  }
  await verify()
  return destination
}
