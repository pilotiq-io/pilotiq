import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextareaField } from './TextareaField.js'

describe('TextareaField', () => {
  it('emits fieldType "textarea" and rows defaulting to 4', () => {
    const meta = TextareaField.make('bio').toMeta()
    assert.equal(meta.fieldType, 'textarea')
    assert.equal(meta['rows'], 4)
  })

  it('rows(n) overrides the default', () => {
    const meta = TextareaField.make('bio').rows(10).toMeta()
    assert.equal(meta['rows'], 10)
  })

  it('cols(n) emits cols only when set', () => {
    const off = TextareaField.make('bio').toMeta()
    const on  = TextareaField.make('bio').cols(40).toMeta()
    assert.equal(off['cols'], undefined)
    assert.equal(on['cols'],  40)
  })

  it('autosize() emits the flag only when called', () => {
    const off = TextareaField.make('bio').toMeta()
    const on  = TextareaField.make('bio').autosize().toMeta()
    assert.equal(off['autosize'], undefined)
    assert.equal(on['autosize'],  true)
  })

  it('autosize(false) is a no-op default', () => {
    const meta = TextareaField.make('bio').autosize(false).toMeta()
    assert.equal(meta['autosize'], undefined)
  })

  it('disableGrammarly() emits the flag only when called', () => {
    const off = TextareaField.make('bio').toMeta()
    const on  = TextareaField.make('bio').disableGrammarly().toMeta()
    assert.equal(off['disableGrammarly'], undefined)
    assert.equal(on['disableGrammarly'],  true)
  })

  it('the chainables compose with each other and with rows/required', () => {
    const meta = TextareaField.make('bio')
      .rows(8)
      .cols(60)
      .autosize()
      .disableGrammarly()
      .required()
      .toMeta()
    assert.equal(meta['rows'],             8)
    assert.equal(meta['cols'],             60)
    assert.equal(meta['autosize'],         true)
    assert.equal(meta['disableGrammarly'], true)
    assert.equal(meta.required,            true)
  })
})
