import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ColorColumn } from './ColorColumn.js'

describe('ColorColumn', () => {
  it('emits columnType:color with the default rounded shape', () => {
    const meta = ColorColumn.make('accent').toMeta()
    assert.equal(meta.columnType, 'color')
    assert.equal(meta.colorShape, 'rounded')
    assert.equal(meta.colorHideValue, undefined)
  })

  it('square() flips the shape', () => {
    const meta = ColorColumn.make('accent').square().toMeta()
    assert.equal(meta.colorShape, 'square')
  })

  it('circle() flips the shape', () => {
    const meta = ColorColumn.make('accent').circle().toMeta()
    assert.equal(meta.colorShape, 'circle')
  })

  it('hideValue() emits the suppress flag', () => {
    const meta = ColorColumn.make('accent').hideValue().toMeta()
    assert.equal(meta.colorHideValue, true)
  })

  it('inherits alignment / tooltip chain from Column', () => {
    const meta = ColorColumn.make('accent')
      .alignment('center')
      .tooltip('Brand color')
      .toMeta()
    assert.equal(meta.alignment, 'center')
    assert.equal(meta.tooltip,   'Brand color')
  })
})
