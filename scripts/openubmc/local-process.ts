/** Bounded private JSON workers and owned loopback page processes. @module */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { z } from 'zod'

/** One owned worker and its first JSON response. */
export interface LocalProcess {
  first: Promise<z.infer<typeof record>>
  done: Promise<void>
  stop(this: void): void
}
const record = z.record(z.string(), z.json())

function stopTree(pid: number): void {
  // Freeze each owned parent before enumerating children, including new sessions.
  try { process.kill(pid, 'SIGSTOP') } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
    throw error
  }
  let children: string
  try { children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8') } catch (_error) {
    // An exited process has no descendants to acquire from /proc.
    children = ''
  }
  for (const child of children.trim().split(/\s+/u).filter(Boolean)) stopTree(Number(child))
  try { process.kill(pid, 'SIGKILL') } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}

/**
 * Send Host-selected JSON through stdin; discard stderr and join process exit on stop.
 * @param python - Selected Python executable.
 * @param script - Owned worker file.
 * @param input - Non-secret selectors and operation fields.
 * @param timeoutMs - Complete process lifetime bound.
 * @param onEvent - Callback for JSON events after the first response.
 * @returns First-response, settlement and termination handles.
 */
export function startLocalProcess(python: string, script: string, input: object, timeoutMs: number,
  onEvent?: (event: z.infer<typeof record>) => void): LocalProcess {
  const child = spawn(python, ['-B', script], { env: scrubbedParentEnv(), stdio: ['pipe', 'pipe', 'ignore'] })
  const first = Promise.withResolvers<z.infer<typeof record>>()
  let responded = false
  let failure: Error | undefined
  let bytes = 0
  const stop = () => { if (child.pid !== undefined && child.exitCode === null) stopTree(child.pid) }
  const fail = (message: string) => { failure ??= new Error(message); stop() }
  const lines = createInterface({ input: child.stdout })
  child.stdout.on('data', (chunk: Buffer) => {
    bytes += chunk.length
    if (bytes > 1024 * 1024) fail('openUBMC local response exceeded 1 MiB.')
  })
  lines.on('line', (line) => {
    if (failure !== undefined) return
    try {
      const value = record.parse(JSON.parse(line))
      if (!responded) { responded = true; first.resolve(value) }
      else onEvent?.(value)
    } catch (_error) { fail('openUBMC local worker returned an invalid response.') }
  })
  const timer = setTimeout(() => { fail('openUBMC local operation timed out.') }, timeoutMs)
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', () => { failure ??= new Error('openUBMC could not launch the configured Python executable.') })
    child.once('close', (code) => {
      clearTimeout(timer)
      lines.close()
      const error = failure ?? (code === 0 && responded ? undefined : new Error('openUBMC local operation failed. Run /openubmc-doctor.'))
      if (error !== undefined) { first.reject(error); reject(error) }
      else resolve()
    })
  })
  // Both handles can be consumed at different times; neither may reject unobserved.
  void first.promise.catch(() => undefined)
  void done.catch(() => undefined)
  child.stdin.on('error', () => { fail('openUBMC local worker closed its input.') })
  child.stdin.end(JSON.stringify(input) + '\n')
  return { first: first.promise, done, stop }
}
