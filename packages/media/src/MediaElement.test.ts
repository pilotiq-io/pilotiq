import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Media } from './MediaElement.js'

test('Media.make() builds a View-typed element pinned to the MediaLibrary component', () => {
  const el = Media.make('library')
  assert.equal(el.getType(), 'view')
  assert.equal(el.getComponentName(), 'MediaLibrary')
  // Eager-mounted (lazy false) so the browser resolves to a non-null payload.
  assert.equal(el.isLazy(), false)
})

test('Media.make() returns a Media instance (chainable setters)', () => {
  const el = Media.make('library').library('photos').directory('fld_1').height(640)
  assert.ok(el instanceof Media)
})

test('resolveServerData derives the _media apiBase from ctx.uploadUrl', async () => {
  const data = await Media.make('library').resolveServerData({ uploadUrl: '/admin/_uploads' } as never) as Record<string, unknown>
  assert.equal(data['ready'], true)
  assert.equal(data['apiBase'], '/admin/_media')
})

test('resolveServerData omits apiBase when no uploadUrl is stamped', async () => {
  const data = await Media.make('library').resolveServerData({} as never) as Record<string, unknown>
  assert.equal('apiBase' in data, false)
  assert.equal(data['ready'], true)
})

test('resolveServerData passes through library / directory / height (sparse)', async () => {
  const bare = await Media.make('a').resolveServerData({} as never) as Record<string, unknown>
  assert.equal('library' in bare, false)
  assert.equal('directory' in bare, false)
  assert.equal('height' in bare, false)

  const set = await Media.make('b').library('photos').directory('fld_1').height(640)
    .resolveServerData({ uploadUrl: '/guest/_uploads' } as never) as Record<string, unknown>
  assert.equal(set['apiBase'], '/guest/_media')
  assert.equal(set['library'], 'photos')
  assert.equal(set['directory'], 'fld_1')
  assert.equal(set['height'], 640)
})

test('Media inherits View layout chrome (columnSpan)', () => {
  // Should not throw — columnSpan is on the Element base.
  const el = Media.make('library').columnSpan(2)
  assert.ok(el instanceof Media)
})
