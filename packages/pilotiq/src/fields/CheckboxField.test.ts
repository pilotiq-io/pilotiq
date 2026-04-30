import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { CheckboxField, Checkbox } from './CheckboxField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('CheckboxField', () => {
  it('emits fieldType "checkbox" — distinct from toggle', () => {
    const meta = CheckboxField.make('agreed').toMeta()
    assert.equal(meta.fieldType, 'checkbox')
  })

  it('exports an alias `Checkbox`', () => {
    assert.equal(Checkbox, CheckboxField)
  })

  it('default(true) emits defaultValue', () => {
    const meta = CheckboxField.make('opt-in').default(true).toMeta()
    assert.equal(meta.defaultValue, true)
  })

  describe('coerceFormValues', () => {
    it('coerces "true" → true', () => {
      const out = coerceFormValues([CheckboxField.make('agreed')], { agreed: 'true' })
      assert.equal(out['agreed'], true)
    })

    it('coerces missing key → false', () => {
      const out = coerceFormValues([CheckboxField.make('agreed')], {})
      assert.equal(out['agreed'], false)
    })

    it('coerces "false" / "0" / "" → false', () => {
      assert.equal(coerceFormValues([CheckboxField.make('a')], { a: 'false' })['a'], false)
      assert.equal(coerceFormValues([CheckboxField.make('a')], { a: '0' })['a'],     false)
      assert.equal(coerceFormValues([CheckboxField.make('a')], { a: '' })['a'],      false)
    })

    it('coerces "on" or any other truthy string → true', () => {
      assert.equal(coerceFormValues([CheckboxField.make('a')], { a: 'on' })['a'],  true)
      assert.equal(coerceFormValues([CheckboxField.make('a')], { a: 'yes' })['a'], true)
    })
  })
})
