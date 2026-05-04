import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { IconColumn } from './IconColumn.js'

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

  it('omits iconOptions when no map is set', () => {
    const meta = IconColumn.make('flag').toMeta()
    assert.equal(meta.columnType,  'icon')
    assert.equal(meta.iconOptions, undefined)
  })

  it('color-less options round-trip', () => {
    const meta = IconColumn.make('icon')
      .options({ a: { icon: 'check' } })
      .toMeta()
    assert.equal(meta.iconOptions?.['a']?.icon, 'check')
    assert.equal(meta.iconOptions?.['a']?.color, undefined)
  })

  it('successive .options() calls merge', () => {
    const meta = IconColumn.make('priority')
      .options({ high: { icon: 'arrow-up'   } })
      .options({ low:  { icon: 'arrow-down' } })
      .toMeta()
    assert.deepEqual(meta.iconOptions, {
      high: { icon: 'arrow-up'   },
      low:  { icon: 'arrow-down' },
    })
  })

  it('inherits the base alignment / tooltip chain', () => {
    const meta = IconColumn.make('status')
      .alignment('center')
      .tooltip('Status flag')
      .toMeta()
    assert.equal(meta.alignment, 'center')
    assert.equal(meta.tooltip,   'Status flag')
  })
})
