import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConversionResult } from '@rudderjs/image'
import {
  isImageMime,
  acceptMatches,
  validateUpload,
  buildStorageKey,
  slugifyStem,
  splitFilename,
  makeUploadToken,
  safeFilename,
  mapConversions,
  isAccessible,
  parseListQuery,
  toRecord,
  type MediaAttrs,
} from './pipeline.js'
import type { MediaLibrary } from './registry.js'

const file = (name: string, type: string, size = 10): File => {
  const f = new File([new Uint8Array(size)], name, { type })
  // `File` size derives from the blob parts; assert our helper's assumption.
  assert.equal(f.size, size)
  return f
}

test('isImageMime', () => {
  assert.equal(isImageMime('image/png'), true)
  assert.equal(isImageMime('IMAGE/JPEG'), true)
  assert.equal(isImageMime('application/pdf'), false)
  assert.equal(isImageMime(null), false)
  assert.equal(isImageMime(undefined), false)
})

test('acceptMatches mirrors the HTML accept attribute', () => {
  const png = file('a.png', 'image/png')
  assert.equal(acceptMatches('*', png), true)
  assert.equal(acceptMatches('*/*', png), true)
  assert.equal(acceptMatches('image/*', png), true)
  assert.equal(acceptMatches('image/png', png), true)
  assert.equal(acceptMatches('image/jpeg', png), false)
  assert.equal(acceptMatches('.png', png), true)
  assert.equal(acceptMatches('.PNG', png), true)
  assert.equal(acceptMatches('.gif', png), false)
  assert.equal(acceptMatches('video/*', png), false)
})

test('validateUpload enforces accept + maxUploadSize', () => {
  const lib: MediaLibrary = { disk: 'public', directory: 'media', accept: ['image/*'], maxUploadSize: 100 }
  assert.deepEqual(validateUpload(file('a.png', 'image/png', 50), lib), { ok: true })

  const wrongType = validateUpload(file('a.pdf', 'application/pdf', 10), lib)
  assert.equal(wrongType.ok, false)
  assert.equal((wrongType as { status: number }).status, 422)

  const tooBig = validateUpload(file('a.png', 'image/png', 200), lib)
  assert.equal(tooBig.ok, false)
  assert.equal((tooBig as { status: number }).status, 422)
})

test('validateUpload with no rules accepts anything', () => {
  const lib: MediaLibrary = { disk: 'public', directory: 'media' }
  assert.deepEqual(validateUpload(file('x.bin', 'application/octet-stream', 9_999), lib), { ok: true })
})

test('buildStorageKey joins + normalizes slashes', () => {
  assert.equal(buildStorageKey('media', 'a.png'), 'media/a.png')
  assert.equal(buildStorageKey('', 'a.png'), 'a.png')
  assert.equal(buildStorageKey('/media/', 'a.png'), 'media/a.png')
  assert.equal(buildStorageKey('media/photos', 'a.png'), 'media/photos/a.png')
})

test('slugifyStem', () => {
  assert.equal(slugifyStem('My Photo (1)'), 'my-photo-1')
  assert.equal(slugifyStem('  --weird__name--  '), 'weird-name')
  assert.equal(slugifyStem('!!!'), 'file')
})

test('splitFilename strips client paths + lowercases ext', () => {
  assert.deepEqual(splitFilename('Photo.JPG'), { stem: 'Photo', ext: '.jpg' })
  assert.deepEqual(splitFilename('archive.tar.gz'), { stem: 'archive.tar', ext: '.gz' })
  assert.deepEqual(splitFilename('C:\\Users\\me\\a.png'), { stem: 'a', ext: '.png' })
  assert.deepEqual(splitFilename('/etc/passwd/file.txt'), { stem: 'file', ext: '.txt' })
  assert.deepEqual(splitFilename('noext'), { stem: 'noext', ext: '' })
  assert.deepEqual(splitFilename('.env'), { stem: '.env', ext: '' })
})

test('makeUploadToken is unique + slug-prefixed; safeFilename keeps ext', () => {
  const a = makeUploadToken('My Photo.png')
  const b = makeUploadToken('My Photo.png')
  assert.match(a, /^my-photo-[0-9a-f-]{36}$/)
  assert.notEqual(a, b) // uuid uniqueness defeats collisions
  assert.equal(safeFilename('My Photo.PNG'), 'my-photo.png')
  assert.equal(safeFilename('noext'), 'noext')
})

test('mapConversions maps ConversionResult.path → ConversionInfo.filename', () => {
  const results: ConversionResult[] = [
    { name: 'thumb', path: 'media/x/thumb.webp', width: 200, height: 200, size: 1234, format: 'webp' },
    { name: 'preview', path: 'media/x/preview.webp', width: 800, height: 600, size: 5678, format: 'webp' },
  ]
  assert.deepEqual(mapConversions(results), [
    { name: 'thumb', filename: 'media/x/thumb.webp', width: 200, height: 200, size: 1234, format: 'webp' },
    { name: 'preview', filename: 'media/x/preview.webp', width: 800, height: 600, size: 5678, format: 'webp' },
  ])
})

test('isAccessible — shared visible to all, private only to owner', () => {
  assert.equal(isAccessible({ scope: 'shared', userId: null }, { scope: 'shared', userId: null }), true)
  assert.equal(isAccessible({ scope: 'shared', userId: '7' }, { scope: 'private', userId: '9' }), true)
  assert.equal(isAccessible({ scope: 'private', userId: '7' }, { scope: 'private', userId: '7' }), true)
  assert.equal(isAccessible({ scope: 'private', userId: '7' }, { scope: 'private', userId: '9' }), false)
  assert.equal(isAccessible({ scope: 'private', userId: '7' }, { scope: 'shared', userId: null }), false)
})

test('parseListQuery defaults + clamps', () => {
  assert.deepEqual(parseListQuery(undefined), {
    parentId: null, scope: 'shared', search: '', sort: 'name', dir: 'ASC', page: 1, perPage: 50,
  })
  assert.deepEqual(parseListQuery({ parentId: 'root' }).parentId, null)
  assert.deepEqual(parseListQuery({ parentId: 'abc' }).parentId, 'abc')
  assert.equal(parseListQuery({ scope: 'private' }).scope, 'private')
  assert.equal(parseListQuery({ scope: 'bogus' }).scope, 'shared')
  assert.equal(parseListQuery({ sort: 'size', dir: 'desc' }).sort, 'size')
  assert.equal(parseListQuery({ sort: 'size', dir: 'desc' }).dir, 'DESC')
  assert.equal(parseListQuery({ sort: 'hacky' }).sort, 'name')
  assert.equal(parseListQuery({ perPage: '999' }).perPage, 100) // clamp
  assert.equal(parseListQuery({ perPage: '0' }).perPage, 50)    // floor → default
  assert.equal(parseListQuery({ page: '3' }).page, 3)
  assert.equal(parseListQuery({ page: '-2' }).page, 1)
  assert.equal(parseListQuery({ search: 'x'.repeat(300) }).search.length, 200)
})

test('toRecord coerces a raw column bag + defaults loose values', () => {
  const attrs: MediaAttrs = {
    id: 'abc', name: 'Photo', type: 'file', mime: 'image/png', size: 1024,
    disk: 'public', directory: 'media/x', filename: 'photo.png', width: 800, height: 600,
    focalX: 0.5, focalY: 0.5, conversions: [{ name: 'thumb', filename: 'media/x/thumb.webp', width: 200, height: 200, size: 1, format: 'webp' }],
    alt: 'a photo', meta: { tag: 'hero' }, parentId: null, scope: 'shared', userId: '7',
    createdAt: '2026-06-17T00:00:00.000Z', updatedAt: '2026-06-17T00:00:00.000Z',
  }
  const rec = toRecord(attrs)
  assert.equal(rec.id, 'abc')
  assert.equal(rec.type, 'file')
  assert.equal(rec.width, 800)
  assert.equal(rec.conversions.length, 1)
  assert.deepEqual(rec.meta, { tag: 'hero' })
  assert.equal(rec.parentId, null)
  assert.equal(rec.userId, '7')
  assert.equal(rec.url, undefined) // url is attached by the store, not the pure mapper
})

test('toRecord folder defaults + junk coercion', () => {
  const attrs: MediaAttrs = {
    id: 42, name: 123, type: 'folder', mime: 0, size: 'nan',
    disk: undefined, directory: null, filename: null, width: NaN, height: undefined,
    focalX: null, focalY: null, conversions: 'not-an-array', alt: '', meta: 'oops',
    parentId: '', scope: 'weird', userId: null, createdAt: 0, updatedAt: undefined,
  }
  const rec = toRecord(attrs)
  assert.equal(rec.id, '42')        // stringified
  assert.equal(rec.name, '')        // non-string → ''
  assert.equal(rec.type, 'folder')
  assert.equal(rec.mime, null)
  assert.equal(rec.size, null)      // 'nan' → null
  assert.equal(rec.disk, 'public')  // undefined → default
  assert.equal(rec.directory, '')
  assert.equal(rec.width, null)     // NaN → null
  assert.deepEqual(rec.conversions, []) // non-array → []
  assert.equal(rec.alt, null)       // empty string → null
  assert.deepEqual(rec.meta, {})    // non-object → {}
  assert.equal(rec.parentId, null)  // empty string → null
  assert.equal(rec.scope, 'shared') // unknown → 'shared'
  assert.equal(rec.createdAt, '')   // non-string → ''
})
