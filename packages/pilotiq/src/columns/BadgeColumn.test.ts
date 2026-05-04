import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BadgeColumn } from './BadgeColumn.js'

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

  it('successive .colors() calls merge instead of replace', () => {
    const meta = BadgeColumn.make('status')
      .colors({ draft: 'gray' })
      .colors({ published: 'success' })
      .toMeta()
    assert.deepEqual(meta.badgeColors, { draft: 'gray', published: 'success' })
  })

  it('later keys win on collision', () => {
    const meta = BadgeColumn.make('status')
      .colors({ pending: 'gray' })
      .colors({ pending: 'warning' })
      .toMeta()
    assert.equal(meta.badgeColors?.['pending'], 'warning')
  })

  it('composes with formatStateUsing for server-side label rewrites', () => {
    const col = BadgeColumn.make('status')
      .colors({ draft: 'gray' })
      .formatStateUsing((v) => `[${v}]`)
    const meta = col.toMeta()
    assert.equal(meta.columnType,   'badge')
    assert.equal(meta.hasFormatter, true)
    assert.deepEqual(meta.badgeColors, { draft: 'gray' })
  })
})
