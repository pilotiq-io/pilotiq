/**
 * Store-orchestration tests. The persistence layer (`Media` model) is faked
 * in-memory, but the storage + image pipeline is REAL: `Storage.fake()` gives
 * an in-memory disk and `@rudderjs/image` runs actual sharp conversions, so
 * these exercise the true upload → convert → persist path and recursive delete.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Storage } from '@rudderjs/storage'
import type { FakeAdapter } from '@rudderjs/storage'
import { Media } from './Media.js'
import {
  uploadFile,
  createFolder,
  deleteMedia,
  moveMedia,
  listMedia,
  updateMetadata,
  MediaRequestError,
} from './store.js'
import type { MediaLibrary } from './registry.js'
import type { MediaAuth } from './pipeline.js'

// ── In-memory Media fake ─────────────────────────────────
type Row = Record<string, unknown> & { id: string }
let rows: Map<string, Row>
let seq: number

interface FakeBuilder {
  where(col: string, opOrVal: unknown, maybeVal?: unknown): FakeBuilder
  whereNull(col: string): FakeBuilder
  orderBy(col?: string, dir?: string): FakeBuilder
  get(): Promise<Row[]>
  paginate(page: number, perPage: number): Promise<{
    data: Row[]; total: number; perPage: number; currentPage: number; lastPage: number; from: number; to: number
  }>
}

function builder(): FakeBuilder {
  let result = [...rows.values()]
  const b: FakeBuilder = {
    where(col, opOrVal, maybeVal) {
      const hasOp = maybeVal !== undefined
      const op = hasOp ? opOrVal : '='
      const val = hasOp ? maybeVal : opOrVal
      result = result.filter(r => (op === 'LIKE'
        ? String(r[col] ?? '').toLowerCase().includes(String(val).replace(/[%\\]/g, '').toLowerCase())
        : r[col] === val))
      return b
    },
    whereNull(col) { result = result.filter(r => r[col] === null || r[col] === undefined); return b },
    orderBy() { return b },
    async get() { return result },
    async paginate(page, perPage) {
      const total = result.length
      const start = (page - 1) * perPage
      const data = result.slice(start, start + perPage)
      return { data, total, perPage, currentPage: page, lastPage: Math.max(1, Math.ceil(total / perPage)), from: start + 1, to: start + data.length }
    },
  }
  return b
}

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
    const row = rows.get(id)
    if (!row) return null
    Object.assign(row, data)
    return row
  }
  M['delete'] = async (id: string): Promise<void> => { rows.delete(id) }
  M['query'] = (): FakeBuilder => builder()
}

let disk: FakeAdapter
const SHARED: MediaAuth = { scope: 'shared', userId: null }

const lib = (over: Partial<MediaLibrary> = {}): MediaLibrary => ({
  disk: 'public',
  directory: 'media',
  ...over,
})

// A real 16×16 RGBA PNG — sharp can probe + resize it (a degenerate 1×1
// trips libpng on resize).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGM4EaDxnxLMMGrAqAGjBgwXAwACAD8fscHNawAAAABJRU5ErkJggg==',
  'base64',
)
const pngFile = (name = 'photo.png'): File => new File([PNG], name, { type: 'image/png' })

beforeEach(() => {
  rows = new Map()
  seq = 0
  installMediaFake()
  disk = Storage.fake('public')
})
afterEach(() => Storage.restoreFakes())

test('uploadFile writes the original to a unique directory + stamps the row', async () => {
  const rec = await uploadFile({ file: pngFile(), parentId: null, alt: 'hero' }, lib(), SHARED)

  assert.equal(rec.type, 'file')
  assert.equal(rec.name, 'photo.png')
  assert.equal(rec.mime, 'image/png')
  assert.equal(rec.alt, 'hero')
  assert.equal(rec.scope, 'shared')
  // Unique per-upload directory under the library directory.
  assert.match(rec.directory, /^media\/photo-[0-9a-f-]{36}$/)
  assert.equal(rec.filename, 'photo.png')
  // Original landed on disk at directory/filename.
  disk.assertExists(`${rec.directory}/${rec.filename}`)
  // Image dimensions were probed.
  assert.equal(rec.width, 16)
  assert.equal(rec.height, 16)
})

test('uploadFile runs the library conversions to disk + persists them', async () => {
  const rec = await uploadFile(
    { file: pngFile(), parentId: null, alt: null },
    lib({ conversions: [{ name: 'thumb', width: 50, height: 50, crop: true, format: 'webp' }] }),
    SHARED,
  )

  assert.equal(rec.conversions.length, 1)
  const thumb = rec.conversions[0]!
  assert.equal(thumb.name, 'thumb')
  assert.equal(thumb.format, 'webp')
  // Conversion file lives in the SAME unique directory → no cross-upload collision.
  assert.equal(thumb.filename, `${rec.directory}/thumb.webp`)
  disk.assertExists(thumb.filename)
})

test('two uploads of the same name never collide on disk', async () => {
  const a = await uploadFile({ file: pngFile('logo.png'), parentId: null, alt: null }, lib(), SHARED)
  const b = await uploadFile({ file: pngFile('logo.png'), parentId: null, alt: null }, lib(), SHARED)
  assert.notEqual(a.directory, b.directory)
  disk.assertExists(`${a.directory}/${a.filename}`)
  disk.assertExists(`${b.directory}/${b.filename}`)
})

test('uploadFile skips conversions + dimensions for non-images', async () => {
  const pdf = new File([Buffer.from('%PDF-1.4 fake')], 'doc.pdf', { type: 'application/pdf' })
  const rec = await uploadFile(
    { file: pdf, parentId: null, alt: null },
    lib({ conversions: [{ name: 'thumb', width: 50 }] }),
    SHARED,
  )
  assert.equal(rec.conversions.length, 0)
  assert.equal(rec.width, null)
  assert.equal(rec.height, null)
  disk.assertExists(`${rec.directory}/${rec.filename}`)
})

test('private uploads stamp scope + userId', async () => {
  const rec = await uploadFile({ file: pngFile(), parentId: null, alt: null }, lib(), { scope: 'private', userId: '7' })
  assert.equal(rec.scope, 'private')
  assert.equal(rec.userId, '7')
})

test('createFolder stamps a folder row at the given parent', async () => {
  const folder = await createFolder({ name: 'Photos', parentId: null }, SHARED)
  assert.equal(folder.type, 'folder')
  assert.equal(folder.name, 'Photos')
  assert.equal(folder.parentId, null)
  assert.equal(folder.filename, '')
})

test('deleteMedia on a folder recurses: removes rows + every stored file', async () => {
  const folder = await createFolder({ name: 'Album', parentId: null }, SHARED)
  const f1 = await uploadFile({ file: pngFile('a.png'), parentId: folder.id, alt: null }, lib({ conversions: [{ name: 'thumb', width: 30 }] }), SHARED)
  const sub = await createFolder({ name: 'Sub', parentId: folder.id }, SHARED)
  const f2 = await uploadFile({ file: pngFile('b.png'), parentId: sub.id, alt: null }, lib(), SHARED)

  assert.equal(rows.size, 4)
  disk.assertExists(`${f1.directory}/${f1.filename}`)
  disk.assertExists(f1.conversions[0]!.filename)
  disk.assertExists(`${f2.directory}/${f2.filename}`)

  const ok = await deleteMedia(folder.id, SHARED)
  assert.equal(ok, true)

  // Every descendant row gone…
  assert.equal(rows.size, 0)
  // …and every stored file + conversion removed from disk.
  disk.assertMissing(`${f1.directory}/${f1.filename}`)
  disk.assertMissing(f1.conversions[0]!.filename)
  disk.assertMissing(`${f2.directory}/${f2.filename}`)
})

test('deleteMedia returns false for a missing id', async () => {
  assert.equal(await deleteMedia('nope', SHARED), false)
})

test('moveMedia rejects parenting an item under itself', async () => {
  const folder = await createFolder({ name: 'F', parentId: null }, SHARED)
  await assert.rejects(() => moveMedia(folder.id, folder.id, SHARED), MediaRequestError)
})

test('moveMedia rejects a cycle (folder into its own descendant)', async () => {
  const parent = await createFolder({ name: 'Parent', parentId: null }, SHARED)
  const child = await createFolder({ name: 'Child', parentId: parent.id }, SHARED)
  await assert.rejects(() => moveMedia(parent.id, child.id, SHARED), MediaRequestError)
})

test('moveMedia rejects a non-folder target', async () => {
  const fileRec = await uploadFile({ file: pngFile(), parentId: null, alt: null }, lib(), SHARED)
  const folder = await createFolder({ name: 'F', parentId: null }, SHARED)
  await assert.rejects(() => moveMedia(folder.id, fileRec.id, SHARED), MediaRequestError)
})

test('moveMedia reparents on a valid target', async () => {
  const a = await createFolder({ name: 'A', parentId: null }, SHARED)
  const b = await createFolder({ name: 'B', parentId: null }, SHARED)
  const moved = await moveMedia(b.id, a.id, SHARED)
  assert.equal(moved?.parentId, a.id)
})

test('updateMetadata writes alt + custom meta and revives them on read', async () => {
  const f = await uploadFile({ file: pngFile('m.png'), parentId: null, alt: null }, lib(), SHARED)
  assert.equal(f.alt, null)
  assert.deepEqual(f.meta, {})

  const updated = await updateMetadata(f.id, { alt: 'A red square', meta: { credit: 'Jane', year: 2026 } }, SHARED)
  assert.equal(updated?.alt, 'A red square')
  assert.deepEqual(updated?.meta, { credit: 'Jane', year: 2026 })
})

test('updateMetadata patches only the keys provided', async () => {
  const f = await uploadFile({ file: pngFile('p.png'), parentId: null, alt: 'keep me' }, lib(), SHARED)
  const updated = await updateMetadata(f.id, { meta: { tag: 'x' } }, SHARED)
  assert.equal(updated?.alt, 'keep me')         // alt untouched
  assert.deepEqual(updated?.meta, { tag: 'x' })
})

test('updateMetadata returns null for a missing / inaccessible id', async () => {
  assert.equal(await updateMetadata('nope', { alt: 'x' }, SHARED), null)
  const priv = await uploadFile({ file: pngFile('o.png'), parentId: null, alt: null }, lib(), { scope: 'private', userId: '1' })
  assert.equal(await updateMetadata(priv.id, { alt: 'x' }, { scope: 'private', userId: '2' }), null)
})

test('listMedia returns a private space filtered to its owner', async () => {
  await uploadFile({ file: pngFile('mine.png'), parentId: null, alt: null }, lib(), { scope: 'private', userId: '7' })
  await uploadFile({ file: pngFile('theirs.png'), parentId: null, alt: null }, lib(), { scope: 'private', userId: '9' })
  await uploadFile({ file: pngFile('shared.png'), parentId: null, alt: null }, lib(), SHARED)

  const mine = await listMedia(
    { parentId: null, scope: 'private', search: '', sort: 'name', dir: 'ASC', page: 1, perPage: 50 },
    { scope: 'private', userId: '7' },
  )
  assert.equal(mine.total, 1)
  assert.equal(mine.data[0]!.name, 'mine.png')

  const shared = await listMedia(
    { parentId: null, scope: 'shared', search: '', sort: 'name', dir: 'ASC', page: 1, perPage: 50 },
    SHARED,
  )
  assert.equal(shared.total, 1)
  assert.equal(shared.data[0]!.name, 'shared.png')
})

test('listMedia with a private scope + no user returns empty', async () => {
  await uploadFile({ file: pngFile(), parentId: null, alt: null }, lib(), { scope: 'private', userId: '7' })
  const res = await listMedia(
    { parentId: null, scope: 'private', search: '', sort: 'name', dir: 'ASC', page: 1, perPage: 50 },
    { scope: 'private', userId: null },
  )
  assert.equal(res.total, 0)
  assert.deepEqual(res.data, [])
})
