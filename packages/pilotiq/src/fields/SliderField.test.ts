import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { SliderField, Slider } from './SliderField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('SliderField', () => {
  it('emits fieldType "slider"', () => {
    const meta = SliderField.make('rating').toMeta()
    assert.equal(meta.fieldType, 'slider')
  })

  it('exports an alias `Slider`', () => {
    assert.equal(Slider, SliderField)
  })

  it('emits min/max/step on meta', () => {
    const meta = SliderField.make('rating').min(0).max(5).step(0.5).toMeta()
    assert.equal(meta['min'],  0)
    assert.equal(meta['max'],  5)
    assert.equal(meta['step'], 0.5)
  })

  it('defaults min=0, max=100, step=1', () => {
    const meta = SliderField.make('x').toMeta()
    assert.equal(meta['min'],  0)
    assert.equal(meta['max'],  100)
    assert.equal(meta['step'], 1)
  })

  it('emits showValue when set', () => {
    const meta = SliderField.make('x').showValue().toMeta()
    assert.equal(meta['showValue'], true)
  })

  it('omits showValue by default', () => {
    const meta = SliderField.make('x').toMeta()
    assert.equal('showValue' in meta, false)
  })

  it('coerces string body to number via the slider branch', () => {
    const out = coerceFormValues([SliderField.make('rating')], { rating: '3.5' })
    assert.equal(out['rating'], 3.5)
  })

  it('empty body → null', () => {
    const out = coerceFormValues([SliderField.make('rating')], { rating: '' })
    assert.equal(out['rating'], null)
  })
})
