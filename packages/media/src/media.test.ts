import { test } from 'node:test'
import assert from 'node:assert/strict'
import { media } from './plugin.js'
import { categorize } from './types.js'

test('media() returns a PilotiqPlugin with the package name', () => {
  const plugin = media()
  assert.equal(plugin.name, '@pilotiq/media')
  assert.equal(typeof plugin.register, 'function')
})

test('media().register() is an inert no-op in the scaffold', () => {
  const plugin = media({ disk: 'public', directory: 'media' })
  // register receives the panel; the scaffold must not throw on a bare stub.
  assert.doesNotThrow(() => plugin.register({} as never))
})

test('categorize() maps MIME types to preview categories', () => {
  assert.equal(categorize('image/png'), 'image')
  assert.equal(categorize('video/mp4'), 'video')
  assert.equal(categorize('audio/mpeg'), 'audio')
  assert.equal(categorize('application/pdf'), 'pdf')
  assert.equal(categorize('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'document')
  assert.equal(categorize('text/csv'), 'spreadsheet')
  assert.equal(categorize('text/markdown'), 'text')
  assert.equal(categorize('application/zip'), 'archive')
  assert.equal(categorize('application/octet-stream'), 'other')
  assert.equal(categorize(null), 'other')
})
