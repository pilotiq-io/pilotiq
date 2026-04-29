import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BadgeColumn, IconColumn, BooleanColumn, ImageColumn } from './index.js'

describe('BadgeColumn', () => {
  it('emits columnType:badge with the value→color map', () => {
    const meta = BadgeColumn.make('status')
      .colors({ draft: 'gray', published: 'success', archived: 'warning' })
      .toMeta()
    assert.equal(meta.columnType, 'badge')
    assert.deepEqual(meta.badgeColors, {
      draft: 'gray', published: 'success', archived: 'warning',
    })
  })

  it('omits badgeColors when no map is set', () => {
    const meta = BadgeColumn.make('status').toMeta()
    assert.equal(meta.columnType, 'badge')
    assert.equal(meta.badgeColors, undefined)
  })

  it('inherits all base column builders', () => {
    const meta = BadgeColumn.make('status').sortable().tooltip('Status').toMeta()
    assert.equal(meta.sortable, true)
    assert.equal(meta.tooltip,  'Status')
  })
})

describe('IconColumn', () => {
  it('emits columnType:icon with the value→{icon,color} map', () => {
    const meta = IconColumn.make('isAdmin')
      .options({
        true:  { icon: 'shield-check', color: 'success' },
        false: { icon: 'user',         color: 'muted'   },
      })
      .toMeta()
    assert.equal(meta.columnType, 'icon')
    assert.deepEqual(meta.iconOptions, {
      true:  { icon: 'shield-check', color: 'success' },
      false: { icon: 'user',         color: 'muted'   },
    })
  })
})

describe('BooleanColumn', () => {
  it('extends IconColumn with default true/false icons', () => {
    const meta = BooleanColumn.make('featured').toMeta()
    assert.equal(meta.columnType, 'boolean')
    assert.equal(meta.iconOptions?.['true']?.icon,  'check-circle-2')
    assert.equal(meta.iconOptions?.['false']?.icon, 'circle')
  })

  it('options() override the defaults', () => {
    const meta = BooleanColumn.make('active')
      .options({
        true:  { icon: 'check', color: 'success' },
        false: { icon: 'x',     color: 'muted'   },
      })
      .toMeta()
    assert.equal(meta.iconOptions?.['true']?.icon, 'check')
    assert.equal(meta.iconOptions?.['false']?.icon, 'x')
  })
})

describe('ImageColumn', () => {
  it('emits columnType:image with size and shape', () => {
    const meta = ImageColumn.make('avatar').size(48).circular().toMeta()
    assert.equal(meta.columnType, 'image')
    assert.equal(meta.imageSize,  48)
    assert.equal(meta.imageShape, 'circle')
  })

  it('defaults to 32px square', () => {
    const meta = ImageColumn.make('avatar').toMeta()
    assert.equal(meta.imageSize,  32)
    assert.equal(meta.imageShape, 'square')
  })
})
