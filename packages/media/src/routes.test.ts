/**
 * Route-layer tests. They drive the REAL handlers registered by
 * `registerMediaRoutes` → the REAL `store.ts` → a faked `Media` model +
 * `Storage.fake()` disk. Only the DB rows + disk bytes are faked, so the guard
 * prelude, scope plumbing, body parsing, and status codes are all exercised
 * end-to-end.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Storage } from '@rudderjs/storage'
import { Media } from './Media.js'
import { registerMediaRoutes } from './routes.js'
import { registerLibrary, resetLibraries } from './registry.js'

// ── In-memory Media fake (mirrors store.test.ts) ─────────
type Row = Record<string, unknown> & { id: string }
let rows: Map<string, Row>
let seq: number

function installMediaFake(): void {
  const M = Media as unknown as Record<string, unknown>
  M['create'] = async (data: Record<string, unknown>): Promise<Row> => {
    const id = `m${++seq}`
    const row: Row = { id, createdAt: '2026-06-17T00:00:00.000Z', updatedAt: '2026-06-17T00:00:00.000Z', ...data }
    rows.set(id, row)
    return row
  }
  M['find'] = async (id: string): Promise<Row | null> => rows.get(id) ?? null
  M['update'] = async (id: string, data: Record<string, unknown>): Promise<Row | null> => {
    const row = rows.get(id); if (!row) return null; Object.assign(row, data); return row
  }
  M['delete'] = async (id: string): Promise<void> => { rows.delete(id) }
  M['query'] = () => {
    let result = [...rows.values()]
    const b: Record<string, unknown> = {}
    b['where'] = (col: string, opOrVal: unknown, maybeVal?: unknown) => {
      const v = maybeVal === undefined ? opOrVal : maybeVal
      result = result.filter(r => r[col] === v); return b
    }
    b['whereNull'] = (col: string) => { result = result.filter(r => r[col] == null); return b }
    b['orderBy'] = () => b
    b['get'] = async () => result
    b['paginate'] = async (page: number, perPage: number) => ({
      data: result.slice((page - 1) * perPage, (page - 1) * perPage + perPage),
      total: result.length, perPage, currentPage: page, lastPage: 1, from: 1, to: result.length,
    })
    return b
  }
}

// ── Fake router / pilotiq / req / res ────────────────────
type Handler = (req: unknown, res: unknown) => unknown
type AnyRouter = Parameters<typeof registerMediaRoutes>[0]
function makeRouter() {
  const routes = new Map<string, Handler>()
  const add = (m: string) => (path: string, handler: Handler) => { routes.set(`${m} ${path}`, handler) }
  const router = { get: add('GET'), post: add('POST') } as unknown as AnyRouter
  return { router, routes }
}

interface PilotiqOpts { guard?: (req: unknown) => boolean | Promise<boolean>; user?: unknown }
function makePilotiq(opts: PilotiqOpts = {}) {
  return {
    getConfig: () => ({ path: '/admin', guard: opts.guard }),
    resolveUser: async () => opts.user ?? null,
  } as never
}

function makeRes() {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    status(code: number) { res._status = code; return res },
    json(body: unknown) { res._json = body; return body },
  }
  return res
}

function call(routes: Map<string, Handler>, key: string, req: Record<string, unknown>) {
  const handler = routes.get(key)
  assert.ok(handler, `route not registered: ${key}`)
  const res = makeRes()
  return Promise.resolve(handler(req, res)).then(() => res)
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGM4EaDxnxLMMGrAqAGjBgwXAwACAD8fscHNawAAAABJRU5ErkJggg==',
  'base64',
)
const pngFile = (name = 'photo.png') => new File([PNG], name, { type: 'image/png' })

beforeEach(() => {
  rows = new Map(); seq = 0
  installMediaFake()
  Storage.fake('public')
  resetLibraries()
  registerLibrary('default', { disk: 'public', directory: 'media' })
})
afterEach(() => { Storage.restoreFakes(); resetLibraries() })

test('guard rejection → 401 on every route', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq({ guard: () => false }))

  const list = await call(routes, 'GET /admin/_media', { query: {} })
  assert.equal(list._status, 401)

  const folder = await call(routes, 'POST /admin/_media/folder', { body: { name: 'x' } })
  assert.equal(folder._status, 401)
})

test('a throwing guard fails closed (401)', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq({ guard: () => { throw new Error('boom') } }))
  const res = await call(routes, 'GET /admin/_media', { query: {} })
  assert.equal(res._status, 401)
})

test('GET _media lists with parsed query', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  await Media.create({ name: 'a.png', type: 'file', scope: 'shared', parentId: null })

  const res = await call(routes, 'GET /admin/_media', { query: { scope: 'shared' } })
  assert.equal(res._status, 200)
  const body = res._json as { ok: boolean; data: unknown[]; total: number }
  assert.equal(body.ok, true)
  assert.equal(body.total, 1)
})

test('POST _media/folder — missing name → 422, success → 200', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())

  const bad = await call(routes, 'POST /admin/_media/folder', { body: { name: '   ' } })
  assert.equal(bad._status, 422)

  const ok = await call(routes, 'POST /admin/_media/folder', { body: { name: 'Photos' } })
  assert.equal(ok._status, 200)
  const body = ok._json as { ok: boolean; media: { type: string; name: string } }
  assert.equal(body.media.type, 'folder')
  assert.equal(body.media.name, 'Photos')
})

test('POST _media/folder — private without an authenticated user → 401', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq()) // no user
  const res = await call(routes, 'POST /admin/_media/folder', { body: { name: 'Secret', scope: 'private' } })
  assert.equal(res._status, 401)
})

test('POST _media/folder — private with a user stamps userId', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq({ user: { id: 42 } }))
  const res = await call(routes, 'POST /admin/_media/folder', { body: { name: 'Secret', scope: 'private' } })
  assert.equal(res._status, 200)
  const body = res._json as { media: { scope: string; userId: string } }
  assert.equal(body.media.scope, 'private')
  assert.equal(body.media.userId, '42')
})

test('POST _media/upload — no file → 422, success → 200', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())

  const noFile = await call(routes, 'POST /admin/_media/upload', {
    raw: { req: { parseBody: async () => ({}) } },
  })
  assert.equal(noFile._status, 422)

  const ok = await call(routes, 'POST /admin/_media/upload', {
    raw: { req: { parseBody: async () => ({ file: pngFile(), parentId: '', scope: 'shared' }) } },
  })
  assert.equal(ok._status, 200)
  const body = ok._json as { ok: boolean; media: { type: string; width: number } }
  assert.equal(body.media.type, 'file')
  assert.equal(body.media.width, 16)
})

test('POST _media/upload — server-side maxUploadSize rejection → 422', async () => {
  resetLibraries()
  registerLibrary('default', { disk: 'public', directory: 'media', maxUploadSize: 4 })
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())

  const res = await call(routes, 'POST /admin/_media/upload', {
    raw: { req: { parseBody: async () => ({ file: pngFile() }) } }, // PNG > 4 bytes
  })
  assert.equal(res._status, 422)
  assert.match((res._json as { error: string }).error, /exceeds/)
})

test('POST _media/upload — multipart unavailable → 500', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  const res = await call(routes, 'POST /admin/_media/upload', { raw: {} })
  assert.equal(res._status, 500)
})

test('GET _media/:id — 404 when missing, 200 when found', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  await Media.create({ id: 'm1', name: 'a.png', type: 'file', scope: 'shared', disk: 'public', directory: 'media', filename: 'a.png', parentId: null } as never)

  const missing = await call(routes, 'GET /admin/_media/:id', { params: { id: 'nope' } })
  assert.equal(missing._status, 404)

  const found = await call(routes, 'GET /admin/_media/:id', { params: { id: 'm1' } })
  assert.equal(found._status, 200)
})

test('POST _media/:id/rename — 422 missing name, 200 success, 404 missing record', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  const folder = await call(routes, 'POST /admin/_media/folder', { body: { name: 'Old' } })
  const id = (folder._json as { media: { id: string } }).media.id

  const noName = await call(routes, 'POST /admin/_media/:id/rename', { params: { id }, body: {} })
  assert.equal(noName._status, 422)

  const ok = await call(routes, 'POST /admin/_media/:id/rename', { params: { id }, body: { name: 'New' } })
  assert.equal(ok._status, 200)
  assert.equal((ok._json as { media: { name: string } }).media.name, 'New')

  const missing = await call(routes, 'POST /admin/_media/:id/rename', { params: { id: 'gone' }, body: { name: 'X' } })
  assert.equal(missing._status, 404)
})

test('POST _media/:id/metadata — updates alt + meta, validates, 404s missing', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  const folder = await call(routes, 'POST /admin/_media/folder', { body: { name: 'F' } })
  const id = (folder._json as { media: { id: string } }).media.id

  const ok = await call(routes, 'POST /admin/_media/:id/metadata', {
    params: { id }, body: { alt: 'Some alt', meta: { credit: 'Jane' } },
  })
  assert.equal(ok._status, 200)
  const m = (ok._json as { media: { alt: string; meta: Record<string, unknown> } }).media
  assert.equal(m.alt, 'Some alt')
  assert.deepEqual(m.meta, { credit: 'Jane' })

  // Non-object meta → 422.
  const badMeta = await call(routes, 'POST /admin/_media/:id/metadata', { params: { id }, body: { meta: 'nope' } })
  assert.equal(badMeta._status, 422)

  // Nothing to update → 422.
  const empty = await call(routes, 'POST /admin/_media/:id/metadata', { params: { id }, body: {} })
  assert.equal(empty._status, 422)

  // Missing record → 404.
  const gone = await call(routes, 'POST /admin/_media/:id/metadata', { params: { id: 'gone' }, body: { alt: 'x' } })
  assert.equal(gone._status, 404)
})

test('POST _media/:id/move — cycle → 422, valid reparent → 200', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  const p = await Media.create({ name: 'P', type: 'folder', scope: 'shared', parentId: null })
  const c = await Media.create({ name: 'C', type: 'folder', scope: 'shared', parentId: p.id })

  // Moving P under its own descendant C is a cycle.
  const cycle = await call(routes, 'POST /admin/_media/:id/move', { params: { id: p.id }, body: { parentId: c.id } })
  assert.equal(cycle._status, 422)

  // Moving C to the root is fine.
  const ok = await call(routes, 'POST /admin/_media/:id/move', { params: { id: c.id }, body: { parentId: null } })
  assert.equal(ok._status, 200)
  assert.equal((ok._json as { media: { parentId: string | null } }).media.parentId, null)
})

test('POST _media/:id/delete — 200 success, 404 missing', async () => {
  const { router, routes } = makeRouter()
  registerMediaRoutes(router, makePilotiq())
  const folder = await call(routes, 'POST /admin/_media/folder', { body: { name: 'Trash' } })
  const id = (folder._json as { media: { id: string } }).media.id

  const ok = await call(routes, 'POST /admin/_media/:id/delete', { params: { id } })
  assert.equal(ok._status, 200)
  assert.equal((ok._json as { ok: boolean }).ok, true)

  const missing = await call(routes, 'POST /admin/_media/:id/delete', { params: { id } })
  assert.equal(missing._status, 404)
})
