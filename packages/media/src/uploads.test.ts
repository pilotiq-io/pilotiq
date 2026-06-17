/**
 * `mediaUpload()` UploadAdapter tests (#216). Same harness as `store.test.ts`:
 * the `Media` model is faked in-memory while the storage + image pipeline is
 * REAL (`Storage.fake()` + actual sharp conversions), so these exercise the true
 * adapter → uploadFile → persist path and the UploadResult shape a core
 * `FileUpload` field consumes.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Storage } from '@rudderjs/storage'
import type { FakeAdapter } from '@rudderjs/storage'
import { Media } from './Media.js'
import { mediaUpload } from './uploads.js'
import { registerLibrary, resetLibraries } from './registry.js'

// ── In-memory Media fake ─────────────────────────────────
type Row = Record<string, unknown> & { id: string }
let rows: Map<string, Row>
let seq: number

function installMediaFake(): void {
  const M = Media as unknown as Record<string, unknown>
  M['create'] = async (data: Record<string, unknown>): Promise<Row> => {
    const id = `m${++seq}`
    const row: Row = { id, createdAt: '2026-06-18T00:00:00.000Z', updatedAt: '2026-06-18T00:00:00.000Z', ...data }
    rows.set(id, row)
    return row
  }
  M['find'] = async (id: string): Promise<Row | null> => rows.get(id) ?? null
}

let disk: FakeAdapter

// A real 16×16 RGBA PNG — sharp can probe + resize it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGM4EaDxnxLMMGrAqAGjBgwXAwACAD8fscHNawAAAABJRU5ErkJggg==',
  'base64',
)
const pngFile = (name = 'photo.png'): File => new File([PNG], name, { type: 'image/png' })

beforeEach(() => {
  rows = new Map()
  seq = 0
  installMediaFake()
  resetLibraries()
  disk = Storage.fake('public')
})
afterEach(() => {
  Storage.restoreFakes()
  resetLibraries()
})

test('mediaUpload().put writes the file, creates a Media row, returns url + meta', async () => {
  registerLibrary('default', { disk: 'public', directory: 'media' })
  const adapter = mediaUpload()

  const result = await adapter.put({ file: pngFile(), fieldName: 'cover' })

  // A Media row was created (file lands in the library).
  assert.equal(rows.size, 1)
  const row = [...rows.values()][0]!
  assert.equal(row['type'], 'file')
  assert.equal(row['scope'], 'shared')
  assert.equal(row['name'], 'photo.png')

  // The stored URL points at the original on the public disk.
  assert.equal(result.url, disk.url(`${row['directory']}/${row['filename']}`))
  disk.assertExists(`${row['directory']}/${row['filename']}`)

  // Meta round-trips the id + mime + size + dimensions for previews.
  assert.equal(result.meta?.['id'], row['id'])
  assert.equal(result.meta?.['mime'], 'image/png')
  assert.equal(result.meta?.['size'], PNG.length)
  assert.equal(result.meta?.['width'], 16)
  assert.equal(result.meta?.['height'], 16)
})

test('mediaUpload() falls back to the default library when none is registered', async () => {
  // No registerLibrary call — getDefaultLibrary() supplies the built-in default.
  const result = await mediaUpload().put({ file: pngFile('logo.png'), fieldName: 'logo' })
  assert.equal(rows.size, 1)
  assert.match(String(result.url), /\/media\/logo-[0-9a-f-]{36}\/logo\.png$/)
})

test('mediaUpload({ library }) targets a named library', async () => {
  registerLibrary('photos', { disk: 'public', directory: 'photos' })
  const result = await mediaUpload({ library: 'photos' }).put({ file: pngFile('p.png'), fieldName: 'pic' })
  const row = [...rows.values()][0]!
  assert.match(String(row['directory']), /^photos\/p-/)
  assert.match(String(result.url), /\/photos\/p-/)
})

test('mediaUpload({ library }) throws when the named library is not registered', async () => {
  await assert.rejects(
    () => mediaUpload({ library: 'nope' }).put({ file: pngFile(), fieldName: 'x' }),
    /media library "nope" is not registered/,
  )
})

test('mediaUpload() runs the library image conversions', async () => {
  registerLibrary('default', {
    disk: 'public',
    directory: 'media',
    conversions: [{ name: 'thumb', width: 50, height: 50, crop: true, format: 'webp' }],
  })
  await mediaUpload().put({ file: pngFile(), fieldName: 'cover' })
  const row = [...rows.values()][0]!
  // The conversion file landed in the same per-upload directory.
  disk.assertExists(`${row['directory']}/thumb.webp`)
})

test('mediaUpload() ignores the directory + preserveFilenames hints (library owns its layout)', async () => {
  registerLibrary('default', { disk: 'public', directory: 'media' })
  const result = await mediaUpload().put({
    file: pngFile('Brand Logo.png'),
    fieldName: 'logo',
    directory: 'ignored-subdir',
    preserveFilenames: true,
  })
  // Slugified into a unique per-upload dir under the library directory — the
  // hints don't leak into the storage key.
  assert.doesNotMatch(String(result.url), /ignored-subdir/)
  assert.match(String(result.url), /\/media\/brand-logo-[0-9a-f-]{36}\/brand-logo\.png$/)
})
