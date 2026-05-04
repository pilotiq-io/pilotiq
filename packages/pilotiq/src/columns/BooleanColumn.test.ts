import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BooleanColumn } from './BooleanColumn.js'
import { IconColumn } from './IconColumn.js'

describe('BooleanColumn', () => {
  it('extends IconColumn with default true/false icons', () => {
    const meta = BooleanColumn.make('featured').toMeta()
    assert.equal(meta.columnType, 'boolean')
    assert.equal(meta.iconOptions?.['true']?.icon,  'check-circle-2')
    assert.equal(meta.iconOptions?.['true']?.color, 'success')
    assert.equal(meta.iconOptions?.['false']?.icon,  'circle')
    assert.equal(meta.iconOptions?.['false']?.color, 'muted')
  })

  it('options() override the defaults', () => {
    const meta = BooleanColumn.make('active')
      .options({
        true:  { icon: 'check', color: 'success' },
        false: { icon: 'x',     color: 'muted'   },
      })
      .toMeta()
    assert.equal(meta.iconOptions?.['true']?.icon,  'check')
    assert.equal(meta.iconOptions?.['false']?.icon, 'x')
  })

  it('is structurally an IconColumn', () => {
    const c = BooleanColumn.make('featured')
    assert.equal(c instanceof IconColumn, true)
  })

  it('inherits the cosmetic chain', () => {
    const meta = BooleanColumn.make('on')
      .alignment('center')
      .tooltip('On / off')
      .toMeta()
    assert.equal(meta.alignment, 'center')
    assert.equal(meta.tooltip,   'On / off')
  })
})
