import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveApiBase,
  listMedia,
  createFolder,
  deleteMedia,
} from './mediaClient.js'

// ── window.location stub for deriveApiBase ───────────────
const g = globalThis as Record<string, unknown>
function setLocation(pathname: string) {
  g['window'] = { location: { pathname } }
}
function clearWindow() {
  delete g['window']
}

// ── fetch capture ────────────────────────────────────────
interface Captured { url: string; init: RequestInit | undefined }
let captured: Captured[]
function stubFetch(response: { ok?: boolean; status?: number; body: unknown }) {
  captured = []
  g['fetch'] = (url: string, init?: RequestInit) => {
    captured.push({ url, init })
    return Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body,
    })
  }
}

beforeEach(() => { captured = [] })
afterEach(() => { clearWindow(); delete g['fetch'] })

test('deriveApiBase strips the trailing page slug', () => {
  setLocation('/admin/media')
  assert.equal(deriveApiBase('media'), '/admin/_media')
})

test('deriveApiBase tolerates a trailing slash + non-matching path', () => {
  setLocation('/panel/media/')
  assert.equal(deriveApiBase('media'), '/panel/_media')
  setLocation('/admin')
  assert.equal(deriveApiBase('media'), '/admin/_media')
})

test('deriveApiBase is SSR-safe (no window)', () => {
  clearWindow()
  assert.equal(deriveApiBase('media'), '')
})

test('listMedia builds the query + parses the envelope', async () => {
  stubFetch({ body: { ok: true, data: [{ id: 'a' }], total: 1, page: 1, perPage: 100, lastPage: 1 } })
  const res = await listMedia('/admin/_media', { parentId: 'f1', search: 'cat', sort: 'size', dir: 'DESC', perPage: 100 })

  const url = new URL(captured[0]!.url, 'http://x')
  assert.equal(url.pathname, '/admin/_media')
  assert.equal(url.searchParams.get('parentId'), 'f1')
  assert.equal(url.searchParams.get('search'), 'cat')
  assert.equal(url.searchParams.get('sort'), 'size')
  assert.equal(url.searchParams.get('dir'), 'DESC')
  assert.equal(url.searchParams.get('perPage'), '100')
  assert.equal(res.total, 1)
  assert.equal(res.data[0]!.id, 'a')
})

test('listMedia sends parentId=root at the library root', async () => {
  stubFetch({ body: { ok: true, data: [], total: 0 } })
  await listMedia('/admin/_media', { parentId: null })
  assert.match(captured[0]!.url, /parentId=root/)
})

test('createFolder POSTs JSON + unwraps media', async () => {
  stubFetch({ body: { ok: true, media: { id: 'f2', type: 'folder', name: 'New' } } })
  const folder = await createFolder('/admin/_media', 'New', null)
  assert.equal(captured[0]!.url, '/admin/_media/folder')
  assert.equal(captured[0]!.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(captured[0]!.init?.body)), { name: 'New', parentId: null, scope: 'shared' })
  assert.equal(folder.id, 'f2')
})

test('a non-ok / ok:false response throws with the server error', async () => {
  stubFetch({ ok: false, status: 422, body: { ok: false, error: 'Folder name is required' } })
  await assert.rejects(() => createFolder('/admin/_media', '', null), /Folder name is required/)
})

test('deleteMedia hits the delete route', async () => {
  stubFetch({ body: { ok: true } })
  await deleteMedia('/admin/_media', 'm9')
  assert.equal(captured[0]!.url, '/admin/_media/m9/delete')
})
