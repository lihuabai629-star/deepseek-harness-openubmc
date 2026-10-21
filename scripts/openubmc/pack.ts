/** Build an installable openUBMC tarball from a tracked workflow checkout. @module */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, glob, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'tsdown'
import { z } from 'zod'
import { qualifiedHostVersions } from './compatibility.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifestSchema = z.object({ version: z.string().min(1), profiles: z.object({ full: z.array(z.string()).min(1) }),
  skills: z.array(z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), path: z.string().min(1) })) })
const excluded = new Set(['tests', '__pycache__', 'node_modules', '.git'])

function git(workflow: string, args: string[]): string {
  return execFileSync('git', ['-C', workflow, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
}

/**
 * Copy tracked workflow resources without machine-local files or escaping links.
 * @param workflow - Clean workflow checkout.
 * @param target - Empty payload workflow directory.
 * @returns Portable Skill mapping and source identity.
 */
export async function stageWorkflow(workflow: string, target: string) {
  const sourceRoot = await realpath(workflow)
  if (git(sourceRoot, ['status', '--porcelain', '--untracked-files=no']).trim()) throw new Error('Workflow has uncommitted tracked changes.')
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(sourceRoot, 'workflow.json'), 'utf8')))
  const skills = manifest.profiles.full.map((name) => {
    const entry = manifest.skills.find(skill => skill.name === name)
    if (entry === undefined) throw new Error(`Missing workflow Skill: ${name}`)
    return entry
  })
  const paths = [...skills.map(skill => skill.path), 'openubmc-target-runtime',
    'openubmc-kb-mcp/src', 'openubmc-kb-mcp/package.json', 'openubmc-kb-mcp/package-lock.json', 'workflow.json', 'LICENSE']
  for (const path of paths) {
    const local = relative(sourceRoot, resolve(sourceRoot, path))
    if (isAbsolute(path) || local === '..' || local.startsWith(`..${sep}`)) throw new Error(`Workflow path escapes its checkout: ${path}`)
  }
  const files = git(sourceRoot, ['ls-files', '-z', '--', ...paths]).split('\0').filter(Boolean)
  for (const path of files) {
    if (path.split('/').some(part => excluded.has(part)) || path.endsWith('.pyc')) continue
    const source = join(sourceRoot, path)
    if ((await lstat(source)).isSymbolicLink()) throw new Error(`Workflow release resources must be regular files: ${path}`)
    const destination = join(target, path)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
  for (const skill of skills) await readFile(join(target, skill.path, 'SKILL.md'))
  return { skills, workflowVersion: manifest.version, workflowCommit: git(sourceRoot, ['rev-parse', 'HEAD']).trim() }
}

/** Parameters required to create a versioned, prebuilt plugin archive. */
export interface PackOptions {
  /** Clean workflow checkout containing the native Agent gateway. */
  workflow: string
  /** Existing or new artifact output directory. */
  out: string
  /** Explicit plugin semantic version. */
  version: string
}

/**
 * Bundle native adapters and package the Python Runtime, KB and Skill resources.
 * @param options - Source checkout, output directory and release version.
 * @returns Absolute archive path and its SHA-256 digest.
 */
export async function packPlugin(options: PackOptions) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(options.version)) throw new Error('Expected a semantic plugin version.')
  const staging = await mkdtemp(join(tmpdir(), 'dsh-openubmc-pack-'))
  const out = resolve(options.out)
  try {
    const payload = join(staging, 'payload')
    const source = await stageWorkflow(resolve(options.workflow), join(payload, 'workflow'))
    const supplementRoot = join(root, 'scripts/openubmc/supplement')
    const supplement = z.object({ version: z.string(), sourceCommit: z.string(),
      files: z.record(z.string(), z.string()) }).parse(JSON.parse(await readFile(join(supplementRoot, 'source.json'), 'utf8')))
    for (const name of Object.keys(supplement.files)) {
      if (name.includes('..') || isAbsolute(name)) throw new Error('Invalid supplementary resource path.')
      const destination = join(payload, 'workflow', name)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(join(supplementRoot, name), destination)
    }
    const developer = source.skills.find(skill => skill.name === 'openubmc-developer')
    if (developer !== undefined) {
      const skillPath = join(payload, 'workflow', developer.path, 'SKILL.md')
      await writeFile(skillPath, await readFile(skillPath, 'utf8') + '\n## Local source checks\n\n'
        + 'For MDB/Redfish JSON, concurrency, Web Backend or Redfish interface changes, use '
        + '[community checks](references/community-checks.md) against the selected workspace and explicit files. '
        + 'For interface documentation, use [interface coverage](references/interface-coverage.md). '
        + 'These source checks do not qualify target behavior or replace Runtime Gates.\n')
    }
    await writeFile(join(payload, 'skills.json'), JSON.stringify({ skills: source.skills }, null, 2) + '\n')
    await copyFile(join(root, 'scripts/openubmc/environment-skill.md'), join(payload, 'environment-skill.md'))
    await copyFile(join(root, 'scripts/openubmc/runtime_stdio.py'), join(payload, 'runtime_stdio.py'))
    for (const name of ['local_admin.py', 'host_records.py']) await copyFile(join(root, 'scripts/openubmc', name), join(payload, name))
    const pagePath = join(payload, 'workflow/openubmc-environment-setup/assets/config-page/index.html')
    await writeFile(pagePath, (await readFile(pagePath, 'utf8'))
      .replace('id="plugin-preview"', 'id="plugin-preview" hidden')
      .replace('href="/page.css"', 'href="page.css"').replace('src="/page.js"', 'src="page.js"')
      .replace('检查当前版本、启动状态和升级遗留配置。设备连接需另行检查。', '检查当前版本、启动状态和本地依赖。设备连接需另行检查。'))
    const pageScript = join(dirname(pagePath), 'page.js')
    await writeFile(pageScript, (await readFile(pageScript, 'utf8'))
      .replace('fetch(path, {', "fetch(new URL('.' + path, location.href), {")
      .replaceAll('"openubmc-configuration-session"', '"openubmc-configuration-session:" + location.pathname')
      .replaceAll('"可启动"', '"本地模块可加载，服务连接状态见 DSH 工具"'))
    const version = z.object({ version: z.string() }).parse(JSON.parse(await readFile(join(root, 'apps/cli/package.json'), 'utf8'))).version
    const bundles = await build({ config: false, entry: { index: join(root, 'scripts/openubmc/plugin-entry.ts'),
      preflight: join(root, 'scripts/openubmc/plugin-preflight.ts') },
    outDir: join(staging, 'lib'), tsconfig: join(root, 'tsconfig.json'), platform: 'node', format: 'esm', dts: false,
    deps: { neverBundle: id => id.startsWith('@modelcontextprotocol/client') || id.startsWith('@deepseek-ai/') && !id.startsWith('@deepseek-ai/dsh-experimental-openubmc-') && id !== '@deepseek-ai/dsh-atomic-write',
      alwaysBundle: [/^@deepseek-ai\/dsh-experimental-openubmc-/, /^@deepseek-ai\/dsh-atomic-write$/], onlyBundle: false },
    clean: true, sourcemap: false, outExtensions: () => ({ js: '.js' }) })
    const clientExternals = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']
    await build({ config: false, entry: { client: join(root, 'scripts/openubmc/plugin.client.tsx') },
      outDir: join(staging, 'lib'), tsconfig: join(root, 'tsconfig.base.client.json'), platform: 'browser', format: 'cjs',
      dts: false, clean: false, sourcemap: false, deps: { neverBundle: clientExternals, onlyBundle: false },
      outputOptions: { banner: 'window.__ModuleLoader__.load({id:"dsh-openubmc",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
        footer: 'return module.exports;}});' }, outExtensions: () => ({ js: '.js' }) })
    const lock = z.object({ packages: z.record(z.string(), z.object({ version: z.string().optional() }).loose()) })
      .parse(JSON.parse(await readFile(join(payload, 'workflow/openubmc-kb-mcp/package-lock.json'), 'utf8')))
    const dependencies: Record<string, string> = { '@modelcontextprotocol/client': '2.0.0' }
    for (const name of ['@modelcontextprotocol/sdk', 'zod']) {
      const selected = lock.packages[`node_modules/${name}`]?.version
      if (selected === undefined) throw new Error(`Missing locked KB dependency: ${name}`)
      dependencies[name] = selected
    }
    const requiredPeers = new Set(['@deepseek-ai/cordis'])
    for (const bundle of bundles) for (const chunk of bundle.chunks) {
      if (chunk.type !== 'chunk') continue
      for (const specifier of chunk.imports) {
        const name = /^(@deepseek-ai\/[^/]+)/.exec(specifier)?.[1]
        if (name !== undefined) requiredPeers.add(name)
      }
    }
    const supportedHosts = qualifiedHostVersions.join(' || ')
    const peers: Record<string, string> = { '@deepseek-ai/dsh': supportedHosts }
    for await (const path of glob(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: root })) {
      const manifest = z.object({ name: z.string(), version: z.string() }).parse(JSON.parse(await readFile(join(root, path), 'utf8')))
      if (requiredPeers.delete(manifest.name)) peers[manifest.name] = manifest.name.startsWith('@deepseek-ai/dsh-') ? supportedHosts : manifest.version
    }
    if (requiredPeers.size > 0) throw new Error(`Unresolved Host dependencies: ${[...requiredPeers].join(', ')}`)
    await writeFile(join(staging, 'package.json'), JSON.stringify({ name: 'dsh-openubmc', version: options.version,
      description: 'openUBMC workflows, native observe/execute, durable Runs and knowledge tools for DSH',
      type: 'module', license: '(MIT AND MulanPSL-2.0)', main: './lib/index.js', exports: { '.': './lib/index.js', './package.json': './package.json',
        './cordis.patch.yml': './cordis.patch.yml', './preflight': './lib/preflight.js', './client': './lib/client.js' },
      files: ['lib', 'payload', 'cordis.patch.yml', 'release.json', 'integrity.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'README.md', 'README.zh.md'],
      engines: { node: '^22.19.0 || >=24.0.0' }, os: ['linux'],
      dependencies, peerDependencies: peers,
      peerDependenciesMeta: Object.fromEntries(Object.keys(peers).map(name => [name, { optional: true }])),
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-plugin-manager'] } } }, null, 2) + '\n')
    await writeFile(join(staging, 'cordis.patch.yml'), '- insert:\n    - id: openubmc\n      name: dsh-openubmc\n')
    await writeFile(join(staging, 'release.json'), JSON.stringify({ ...source, pluginVersion: options.version,
      supplementarySkills: supplement,
      dshVersion: version, qualifiedHosts: supportedHosts.split(' || '), authoritySchema: 'dsh-openubmc/session-authority/v1', dshCommit: git(root, ['rev-parse', 'HEAD']).trim() }, null, 2) + '\n')
    await copyFile(join(root, 'LICENSE'), join(staging, 'LICENSE'))
    const notices: string[] = []
    for (const dependency of ['zod', 'js-yaml']) {
      const manifest = fileURLToPath(import.meta.resolve(`${dependency}/package.json`))
      const metadata = z.object({ version: z.string() }).parse(JSON.parse(await readFile(manifest, 'utf8')))
      notices.push(`${dependency}@${metadata.version}\n${await readFile(join(dirname(manifest), 'LICENSE'), 'utf8')}`)
    }
    await writeFile(join(staging, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n') + '\n')
    for (const name of ['README.md', 'README.zh.md']) await copyFile(join(root, 'scripts/openubmc/distribution', name), join(staging, name))
    const inventory: Record<string, string> = {}
    for await (const name of glob('**/*', { cwd: staging })) {
      const path = join(staging, name)
      if ((await lstat(path)).isFile()) inventory[name] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    await writeFile(join(staging, 'integrity.json'), JSON.stringify({ schema: 'dsh-openubmc/integrity/v1', files: inventory }, null, 2) + '\n')
    await mkdir(out, { recursive: true })
    const packed = z.array(z.object({ filename: z.string() })).length(1).parse(JSON.parse(execFileSync('npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: staging, encoding: 'utf8', maxBuffer: 1024 * 1024 })))
    const result = packed[0]
    if (result === undefined) throw new Error('npm pack returned no archive.')
    const archive = join(out, result.filename)
    const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex')
    await writeFile(`${archive}.sha256`, `${sha256}  ${result.filename}\n`)
    return { archive, sha256 }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { workflow: { type: 'string' }, out: { type: 'string' }, version: { type: 'string' } } })
  if (!values.workflow || !values.out || !values.version) throw new Error('Usage: pack.ts --workflow <checkout> --out <directory> --version <version>')
  console.log(JSON.stringify(await packPlugin({ workflow: values.workflow, out: values.out, version: values.version })))
}
