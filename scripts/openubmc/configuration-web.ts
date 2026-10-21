/** Authenticated same-origin access to owned private configuration pages. @module */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { installLocalAdmin } from './local-admin.ts'

interface Connection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}
type Admin = ReturnType<typeof installLocalAdmin>
type Page = Awaited<ReturnType<Admin['openConfiguration']>>
type Kind = 'targets' | 'kb' | 'conan'

/**
 * Serve only owned loopback pages after the composition's authentication and Origin checks.
 * @param ctx - Optional Web composition fiber.
 * @param admin - Owner of local page processes and their lifetime.
 * @param timeoutMs - Configured local request budget.
 */
export function installConfigurationWeb(ctx: Context, admin: Admin, timeoutMs: number): void {
  const pages = new Map<string, Page>()
  const opening = new Map<Kind, Promise<string>>()
  const requests = new Set<AbortController>()
  let stopping = false
  const isStopping = () => stopping
  ctx.effect(() => async () => {
    stopping = true
    for (const request of requests) request.abort()
    for (const page of pages.values()) page.stop()
    await Promise.allSettled([...pages.values()].map(page => page.done))
  })
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/openubmc', handler: async (req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.setHeader('referrer-policy', 'no-referrer')
    res.setHeader('x-content-type-options', 'nosniff')
    const connection = Reflect.get(ctx, 'connection') as Connection
    const rejected = connection.requestRejection(req)
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return }
    if (stopping) { res.writeHead(503); res.end(); return }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, POST' }); res.end(); return
    }
    const url = new URL(String(req.url), 'http://localhost')
    if (url.pathname === '/openubmc' && req.method === 'GET') {
      const kind = url.searchParams.get('kind') ?? 'targets'
      if (kind !== 'targets' && kind !== 'kb' && kind !== 'conan') { res.writeHead(400); res.end(); return }
      let pending = opening.get(kind)
      if (pending === undefined) {
        pending = (async () => {
          const page = await admin.openConfiguration({ kind, waitForSave: false })
          if (isStopping()) { page.stop(); throw new Error('Plugin stopped') }
          const id = randomUUID()
          pages.set(id, page)
          void page.done.finally(() => { pages.delete(id); opening.delete(kind) }).catch(() => undefined)
          return `./openubmc/${id}/${new URL(page.url).hash}`
        })()
        opening.set(kind, pending)
        void pending.catch(() => { opening.delete(kind) })
      }
      try { res.writeHead(303, { location: await pending }); res.end() }
      catch (_error) { res.writeHead(503); res.end('Use /openubmc-doctor to inspect local setup.') }
      return
    }
    const match = /^\/openubmc\/([a-f0-9-]+)(\/.*)$/u.exec(url.pathname)
    const id = match?.[1]
    const path = match?.[2]
    const page = id === undefined ? undefined : pages.get(id)
    if (page === undefined || path === undefined) { res.writeHead(404); res.end(); return }
    // The upstream origin comes from our worker, never from a request URL.
    const origin = new URL(page.url).origin
    const headers: Record<string, string> = { origin }
    for (const name of ['content-type', 'x-openubmc-session']) {
      const value = req.headers[name]
      if (typeof value === 'string') headers[name] = value
    }
    const controller = new AbortController()
    requests.add(controller)
    const abort = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', abort)
    try {
      const body = req.method === 'POST' ? await readBody(req) : undefined
      if (body === null) { res.writeHead(413); res.end(); return }
      const target = new URL(origin)
      target.pathname = path
      const upstream = await fetch(target, { method: req.method, headers,
        ...(body === undefined ? {} : { body: new Uint8Array(body) }), redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]) })
      res.statusCode = upstream.status
      for (const name of ['content-type', 'content-security-policy']) {
        const value = upstream.headers.get(name)
        if (value !== null) res.setHeader(name, value)
      }
      const bytes = Buffer.from(await upstream.arrayBuffer())
      if (path === '/api/plugin' && req.method === 'POST' && upstream.ok) {
        const result: unknown = JSON.parse(bytes.toString('utf8'))
        if (typeof result === 'object' && result !== null && 'repaired' in result && result.repaired === true) await admin.retryProviders()
      }
      res.end(bytes)
    } catch (_error) { if (!res.writableEnded) { res.writeHead(502); res.end() } }
    finally { requests.delete(controller); res.off('close', abort) }
  } }))
}

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > 1024 * 1024) { req.resume(); return null }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}
