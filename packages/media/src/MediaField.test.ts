import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MediaField, MediaPicker } from './MediaField.js'
import { toMediaRef, type MediaRecord } from './types.js'

test('MediaField.make emits fieldType "media" with single-select defaults', async () => {
  const meta = await MediaField.make('cover').label('Cover').toMeta()
  assert.equal(meta.type, 'field')
  assert.equal(meta.fieldType, 'media')
  assert.equal(meta.name, 'cover')
  assert.equal(meta.label, 'Cover')
  assert.equal((meta as Record<string, unknown>)['multiple'], false)
  assert.equal((meta as Record<string, unknown>)['preview'], true)
})

test('MediaField.multiple() flips the multiple flag', async () => {
  const meta = await MediaField.make('gallery').multiple().toMeta()
  assert.equal((meta as Record<string, unknown>)['multiple'], true)
})

test('MediaField emits accept / library only when set (sparse)', async () => {
  const bare = await MediaField.make('a').toMeta() as Record<string, unknown>
  assert.equal('accept' in bare, false)
  assert.equal('library' in bare, false)

  const set = await MediaField.make('b').accept(['image/*']).library('photos').toMeta() as Record<string, unknown>
  assert.deepEqual(set['accept'], ['image/*'])
  assert.equal(set['library'], 'photos')
})

test('MediaField derives the _media apiBase from the stamped uploadUrl', async () => {
  const meta = await MediaField.make('c').toMeta({ uploadUrl: '/admin/_uploads' }) as Record<string, unknown>
  assert.equal(meta['apiBase'], '/admin/_media')

  const none = await MediaField.make('d').toMeta() as Record<string, unknown>
  assert.equal('apiBase' in none, false)
})

test('MediaField respects base Field chrome (required / helperText)', async () => {
  const meta = await MediaField.make('e').required().helperText('Pick one').toMeta() as Record<string, unknown>
  assert.equal(meta['required'], true)
  assert.equal(meta['helperText'], 'Pick one')
})

test('MediaPicker is an alias of MediaField', () => {
  assert.equal(MediaPicker, MediaField)
})

test('toMediaRef projects a MediaRecord down to a stable reference', () => {
  const rec: MediaRecord = {
    id: '01', name: 'hero.jpg', type: 'file', mime: 'image/jpeg', size: 1234,
    disk: 'public', directory: 'media', filename: 'hero.jpg',
    width: 1600, height: 900, focalX: null, focalY: null,
    conversions: [{ name: 'thumb', filename: 't.webp', width: 200, height: 113, size: 50, format: 'webp', url: '/m/t.webp' }],
    alt: 'A hero', meta: {}, parentId: null, scope: 'shared', userId: null,
    createdAt: '2026-06-18', updatedAt: '2026-06-18', url: '/m/hero.jpg',
  }
  const ref = toMediaRef(rec)
  assert.deepEqual(ref, {
    id: '01', url: '/m/hero.jpg', name: 'hero.jpg', mime: 'image/jpeg',
    width: 1600, height: 900, alt: 'A hero',
    conversions: rec.conversions,
  })
  // Server-only path internals must not leak into the stored reference.
  assert.equal('disk' in ref, false)
  assert.equal('filename' in ref, false)
})
