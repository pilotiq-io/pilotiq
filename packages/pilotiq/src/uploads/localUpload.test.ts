import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { localUpload } from './localUpload.js'

describe('localUpload adapter', () => {
  let dir: string

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'pilotiq-uploads-'))
  })

  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the file under root + returns a URL', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', { type: 'image/png' })
    const result = await adapter.put({ file, fieldName: 'cover' })

    assert.match(result.url, /^\/uploads\/[a-f0-9]{32}\.png$/)
    assert.deepEqual(result.meta, { name: 'photo.png', size: 4, type: 'image/png' })

    const filename = result.url.replace('/uploads/', '')
    const fullPath = join(dir, filename)
    assert.ok(existsSync(fullPath), 'file was written to disk')
    const written = readFileSync(fullPath)
    assert.deepEqual(Array.from(written), [1, 2, 3, 4])
  })

  it('honors the directory option', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
    const file = new File([new Uint8Array([0])], 'img.jpg', { type: 'image/jpeg' })
    const result = await adapter.put({ file, fieldName: 'avatar', directory: 'avatars/2026' })
    assert.match(result.url, /^\/uploads\/avatars\/2026\/[a-f0-9]{32}\.jpg$/)
  })

  it('strips path-traversal segments from directory', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
    const file = new File([new Uint8Array([0])], 'x.png', { type: 'image/png' })
    const result = await adapter.put({ file, fieldName: 'x', directory: '../../../etc/passwd' })
    assert.match(result.url, /^\/uploads\/etc\/passwd\/[a-f0-9]{32}\.png$/)
  })

  it('drops over-long extensions (anti-traversal)', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
    const file = new File([new Uint8Array([0])], 'note.thisisaverylongext', { type: 'text/plain' })
    const result = await adapter.put({ file, fieldName: 'x' })
    // Disallowed ext (>10 chars) → file written without extension
    assert.match(result.url, /^\/uploads\/[a-f0-9]{32}$/)
  })

  it('drops extensions with non-alphanumeric chars', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
    const file = new File([new Uint8Array([0])], 'note.png; rm -rf', { type: 'text/plain' })
    const result = await adapter.put({ file, fieldName: 'x' })
    assert.match(result.url, /^\/uploads\/[a-f0-9]{32}$/)
  })

  it('strips trailing slash from urlPrefix', async () => {
    const adapter = localUpload({ root: dir, urlPrefix: '/uploads/' })
    const file = new File([new Uint8Array([0])], 'x.png', { type: 'image/png' })
    const result = await adapter.put({ file, fieldName: 'x' })
    assert.match(result.url, /^\/uploads\/[a-f0-9]{32}\.png$/)
  })

  describe('preserveFilenames', () => {
    it('keeps the original (sanitized) filename', async () => {
      const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
      const file = new File([new Uint8Array([1, 2, 3])], 'My Report.pdf', { type: 'application/pdf' })
      const result = await adapter.put({ file, fieldName: 'doc', preserveFilenames: true })
      assert.equal(result.url, '/uploads/My-Report.pdf')
      assert.ok(existsSync(join(dir, 'My-Report.pdf')), 'file written under preserved name')
    })

    it('strips path segments + unsafe characters from the preserved name', async () => {
      const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
      const file = new File([new Uint8Array([0])], '../../etc/p@ss wd!.png', { type: 'image/png' })
      const result = await adapter.put({ file, fieldName: 'x', preserveFilenames: true })
      // last segment only, unsafe runs collapse to a dash, ext re-added clean
      assert.equal(result.url, '/uploads/p-ss-wd.png')
    })

    it('same name overwrites (no random suffix)', async () => {
      const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
      const a = new File([new Uint8Array([1])], 'dup.txt', { type: 'text/plain' })
      const b = new File([new Uint8Array([2])], 'dup.txt', { type: 'text/plain' })
      const r1 = await adapter.put({ file: a, fieldName: 'x', preserveFilenames: true })
      const r2 = await adapter.put({ file: b, fieldName: 'x', preserveFilenames: true })
      assert.equal(r1.url, r2.url)
      assert.deepEqual(Array.from(readFileSync(join(dir, 'dup.txt'))), [2], 'later upload overwrote')
    })

    it('falls back to a random id when the name sanitizes to empty', async () => {
      const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
      const file = new File([new Uint8Array([0])], '@@@.png', { type: 'image/png' })
      const result = await adapter.put({ file, fieldName: 'x', preserveFilenames: true })
      assert.match(result.url, /^\/uploads\/[a-f0-9]{32}\.png$/)
    })

    it('default (no flag) still uses a random id', async () => {
      const adapter = localUpload({ root: dir, urlPrefix: '/uploads' })
      const file = new File([new Uint8Array([0])], 'keepme.png', { type: 'image/png' })
      const result = await adapter.put({ file, fieldName: 'x' })
      assert.match(result.url, /^\/uploads\/[a-f0-9]{32}\.png$/)
    })
  })
})
