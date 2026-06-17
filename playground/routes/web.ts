// Pilotiq playground: the pilotiq provider mounts its own /{panel}/...
// routes via @rudderjs/view controllers. What lives here is the demo
// session-login flow backing the guarded /admin panel:
//
//   GET  /login   — Vike page (pages/login/+Page.tsx)
//   POST /login   — verify email/password, stash userId in the session
//   POST /logout  — drop the session user (the panel's user-menu sign-out)
//
// The unguarded /guest panel never touches any of this. Real apps use
// `@rudderjs/auth` instead — this is a hand-rolled stand-in so the
// playground demos `Pilotiq.guard()` without pulling the auth package in.
import { Route } from '@rudderjs/router'
import { safeRedirectTarget } from '@rudderjs/server-hono'
import { Storage } from '@rudderjs/storage'
import { User } from '../app/Models/User.js'
import { verifyPassword } from '../app/Support/password.js'

// Serve the `public` storage disk that @pilotiq/media writes to. The media
// records carry URLs like `/media/<dir>/<file>` (config/storage.ts: the
// `public` disk has `baseUrl: ''`), and nothing serves the `public/` dir
// automatically in this dev setup — so stream files back from the disk here.
// Real apps front their storage with a CDN / S3 public bucket, or a route
// like this. Mirrors the framework playground's `/api/files/*` pattern.
const MEDIA_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
  json: 'application/json', csv: 'text/csv', xml: 'application/xml',
}

Route.get('/media/*', async (req) => {
  // Disk key === the request path minus the leading slash (e.g.
  // `media/<dir>/<file>`). Reject traversal; the LocalAdapter guards too.
  const key = decodeURIComponent((req as { path: string }).path.replace(/^\/+/, ''))
  if (key.includes('..')) return new Response('Not Found', { status: 404 })
  const buffer = await Storage.disk('public').get(key)
  if (!buffer) return new Response('Not Found', { status: 404 })
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return new Response(buffer as unknown as BodyInit, {
    headers: { 'Content-Type': MEDIA_MIME[ext] ?? 'application/octet-stream' },
  })
})

interface SessionLike {
  get<T>(key: string): T | undefined
  put(key: string, value: unknown): void
  forget(key: string): void
  regenerate?(): Promise<void>
}

/** Hono only auto-parses JSON bodies — the login form posts urlencoded,
 *  so fall back to the raw context's `parseBody()`. */
async function readFormBody(req: unknown): Promise<Record<string, unknown>> {
  const r = req as {
    body?: unknown
    raw?: { req?: { parseBody?: () => Promise<Record<string, unknown>> } }
  }
  if (r.body && typeof r.body === 'object' && Object.keys(r.body).length > 0) {
    return r.body as Record<string, unknown>
  }
  try {
    return (await r.raw?.req?.parseBody?.()) ?? {}
  } catch {
    return {}
  }
}

Route.post('/login', async (req, res) => {
  const body = await readFormBody(req)
  const email = String(body.email ?? '').trim().toLowerCase()
  const plain = String(body.password ?? '')
  const session = (req as { session?: SessionLike }).session
  if (!session) {
    res.status(500)
    return res.send('Session unavailable — is the session provider registered?')
  }

  const user = email ? await User.where('email', email).first() : null
  if (!user || !verifyPassword(plain, (user as { password?: string | null }).password)) {
    const keep = typeof body.redirect === 'string' && body.redirect
      ? `&redirect=${encodeURIComponent(body.redirect)}`
      : ''
    return res.redirect(`/login?error=1${keep}`, 303)
  }

  // Rotate the session id on privilege change (fixation hygiene), then
  // stash the user id the panel's guard + user resolver read back.
  await session.regenerate?.()
  session.put('userId', (user as { id: string }).id)
  // Open-redirect guard: `safeRedirectTarget` rejects absolute, protocol-
  // relative, backslash-smuggled, and whitespace/control-char targets,
  // falling back to /admin. (The framework also exposes `res.intended`, but
  // it's not yet in server-hono's .d.ts — this typed helper is equivalent.)
  return res.redirect(safeRedirectTarget(body.redirect, '/admin'), 303)
})

Route.post('/logout', async (req, res) => {
  ;(req as { session?: SessionLike }).session?.forget('userId')
  return res.redirect('/login', 303)
})
