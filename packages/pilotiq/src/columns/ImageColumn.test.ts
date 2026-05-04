import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ImageColumn } from './ImageColumn.js'

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

  it('square() flips back from circular()', () => {
    const meta = ImageColumn.make('avatar').circular().square().toMeta()
    assert.equal(meta.imageShape, 'square')
  })

  it('inherits the alignment / tooltip / width chain', () => {
    const meta = ImageColumn.make('avatar')
      .alignment('center')
      .tooltip('Profile picture')
      .width('80px')
      .toMeta()
    assert.equal(meta.alignment, 'center')
    assert.equal(meta.tooltip,   'Profile picture')
    assert.equal(meta.width,     '80px')
  })

  it('size(64).circular() round-trips', () => {
    const meta = ImageColumn.make('avatar').size(64).circular().toMeta()
    assert.equal(meta.imageSize,  64)
    assert.equal(meta.imageShape, 'circle')
  })
})
