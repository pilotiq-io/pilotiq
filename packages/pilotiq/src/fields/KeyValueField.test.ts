import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { KeyValueField, KeyValue } from './KeyValueField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('KeyValueField', () => {
  it('emits fieldType "keyValue"', () => {
    const meta = KeyValueField.make('headers').toMeta()
    assert.equal(meta.fieldType, 'keyValue')
  })

  it('exports an alias `KeyValue`', () => {
    assert.equal(KeyValue, KeyValueField)
  })

  it('emits keyLabel/valueLabel/addLabel defaults', () => {
    const meta = KeyValueField.make('x').toMeta()
    assert.equal(meta['keyLabel'],   'Key')
    assert.equal(meta['valueLabel'], 'Value')
    assert.equal(meta['addLabel'],   'Add row')
  })

  it('emits custom labels when set', () => {
    const meta = KeyValueField.make('x')
      .keyLabel('Header')
      .valueLabel('Setting')
      .addLabel('Add header')
      .toMeta()
    assert.equal(meta['keyLabel'],   'Header')
    assert.equal(meta['valueLabel'], 'Setting')
    assert.equal(meta['addLabel'],   'Add header')
  })

  it('emits reorderable only when set', () => {
    assert.equal('reorderable' in KeyValueField.make('x').toMeta(),                      false)
    assert.equal(KeyValueField.make('x').reorderable().toMeta()['reorderable'],          true)
  })

  describe('coerceFormValues', () => {
    it('parses JSON string body to object', () => {
      const out = coerceFormValues(
        [KeyValueField.make('headers')],
        { headers: '{"X-Source":"admin","X-Trace":"abc"}' },
      )
      assert.deepEqual(out['headers'], { 'X-Source': 'admin', 'X-Trace': 'abc' })
    })

    it('passes already-object values through', () => {
      const out = coerceFormValues(
        [KeyValueField.make('headers')],
        { headers: { foo: 'bar' } },
      )
      assert.deepEqual(out['headers'], { foo: 'bar' })
    })

    it('filters out the empty placeholder row { "": "" }', () => {
      const out = coerceFormValues(
        [KeyValueField.make('headers')],
        { headers: '{"":"","real":"value"}' },
      )
      assert.deepEqual(out['headers'], { real: 'value' })
    })

    it('preserves rows with empty value but non-empty key', () => {
      const out = coerceFormValues(
        [KeyValueField.make('h')],
        { h: '{"key":""}' },
      )
      assert.deepEqual(out['h'], { key: '' })
    })

    it('empty string body → {}', () => {
      const out = coerceFormValues(
        [KeyValueField.make('h')],
        { h: '' },
      )
      assert.deepEqual(out['h'], {})
    })

    it('null body → {}', () => {
      const out = coerceFormValues(
        [KeyValueField.make('h')],
        { h: null },
      )
      assert.deepEqual(out['h'], {})
    })

    it('malformed JSON → {}', () => {
      const out = coerceFormValues(
        [KeyValueField.make('h')],
        { h: '{not-json' },
      )
      assert.deepEqual(out['h'], {})
    })

    it('stringifies non-string values', () => {
      const out = coerceFormValues(
        [KeyValueField.make('h')],
        { h: { count: 5 } },
      )
      assert.deepEqual(out['h'], { count: '5' })
    })
  })
})
