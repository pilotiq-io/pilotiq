import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ColorPickerField, ColorPicker } from './ColorPickerField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('ColorPickerField', () => {
  it('emits fieldType "color"', () => {
    const meta = ColorPickerField.make('accent').toMeta()
    assert.equal(meta.fieldType, 'color')
  })

  it('exports an alias `ColorPicker`', () => {
    assert.equal(ColorPicker, ColorPickerField)
  })

  it('default(value) emits defaultValue', () => {
    const meta = ColorPickerField.make('accent').default('#d97757').toMeta()
    assert.equal(meta.defaultValue, '#d97757')
  })

  describe('coerceFormValues', () => {
    it('passes hex string through', () => {
      const out = coerceFormValues([ColorPickerField.make('c')], { c: '#ff0000' })
      assert.equal(out['c'], '#ff0000')
    })

    it('empty string → null', () => {
      const out = coerceFormValues([ColorPickerField.make('c')], { c: '' })
      assert.equal(out['c'], null)
    })
  })
})
