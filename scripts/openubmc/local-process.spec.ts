/** Local workers preserve private output bounds and reach process quiescence. @module */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { startLocalProcess } from './local-process.ts'

const linux = it.skipIf(process.platform !== 'linux')
async function fixture(script: string) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-openubmc-worker-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'worker.py')
  await writeFile(file, script)
  const worker = startLocalProcess('python3', file, { directory }, 30000)
  onTestFinished(async () => { worker.stop(); await worker.done.catch(() => undefined) })
  return { directory, worker }
}

linux('returns JSON while discarding private stderr and rejects nonzero completion', async () => {
  const { worker } = await fixture('import sys,json\njson.loads(sys.stdin.readline())\nprint("private diagnostic",file=sys.stderr)\nprint(json.dumps({"ok":True}),flush=True)\nsys.exit(2)\n')
  expect(await worker.first).toEqual({ ok: true })
  await expect(worker.done).rejects.toThrow('local operation failed')
})

linux('terminates a worker and its detached child before settlement', async () => {
  const { directory, worker } = await fixture('import sys,json,subprocess,time,pathlib\na=json.loads(sys.stdin.readline())\np=subprocess.Popen([sys.executable,"-c","import time; time.sleep(300)"],start_new_session=True)\npathlib.Path(a["directory"],"child").write_text(str(p.pid))\nprint(json.dumps({"ready":True}),flush=True)\ntime.sleep(300)\n')
  expect(await worker.first).toEqual({ ready: true })
  const child = Number(await readFile(join(directory, 'child'), 'utf8'))
  worker.stop()
  await expect(worker.done).rejects.toThrow('local operation failed')
  await expect.poll(async () => {
    try { return /\) Z /u.test(await readFile(`/proc/${child}/stat`, 'utf8')) } catch (_error) { return true }
  }).toBe(true)
})

linux('rejects invalid worker output without exposing its contents', async () => {
  const { worker } = await fixture('import sys,json\njson.loads(sys.stdin.readline())\nprint("not-json",flush=True)\n')
  await expect(worker.first).rejects.toThrow('invalid response')
  await expect(worker.done).rejects.toThrow('invalid response')
})

linux('terminates output above the private response limit', async () => {
  const { worker } = await fixture('import sys,json,time\njson.loads(sys.stdin.readline())\nprint("x" * (2 * 1024 * 1024),flush=True)\ntime.sleep(300)\n')
  await expect(worker.first).rejects.toThrow('exceeded 1 MiB')
  await expect(worker.done).rejects.toThrow('exceeded 1 MiB')
})
