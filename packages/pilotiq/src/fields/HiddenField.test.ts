import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { HiddenField, Hidden } from './HiddenField.js'

describe('HiddenField', () => {
  it('emits fieldType "hidden"', () => {
    const meta = HiddenField.make('source').toMeta()
    assert.equal(meta.fieldType, 'hidden')
    assert.equal(meta.name,      'source')
  })

  it('exports an alias `Hidden`', () => {
    assert.equal(Hidden, HiddenField)
  })

  it('supports default value', () => {
    const meta = HiddenField.make('csrf').default('xyz').toMeta()
    assert.equal(meta.defaultValue, 'xyz')
  })

  it('inherits the cross-field plumbing (label, etc.)', () => {
    const meta = HiddenField.make('x').label('Internal').toMeta()
    // label always emits, even though renderer ignores it for hidden type
    assert.equal(meta.label, 'Internal')
  })
})
