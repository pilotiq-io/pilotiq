import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { CheckboxListField, CheckboxList } from './CheckboxListField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('CheckboxListField', () => {
  it('emits fieldType "checkboxList"', async () => {
    const meta = await CheckboxListField.make('cats').toMeta()
    assert.equal(meta.fieldType, 'checkboxList')
  })

  it('exports an alias `CheckboxList`', () => {
    assert.equal(CheckboxList, CheckboxListField)
  })

  it('emits options array', async () => {
    const meta = await CheckboxListField.make('cats').options([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]).toMeta()
    assert.deepEqual(meta['options'], [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ])
  })

  it('emits columns when > 1', async () => {
    const meta = await CheckboxListField.make('x').columns(2).toMeta()
    assert.equal(meta['columns'], 2)
  })

  it('omits columns when default (1)', async () => {
    const meta = await CheckboxListField.make('x').toMeta()
    assert.equal('columns' in meta, false)
  })

  it('clamps columns to >= 1', () => {
    const f = CheckboxListField.make('x').columns(0)
    assert.equal(f.getColumns(), 1)
  })

  describe('coerceFormValues', () => {
    it('array body → string[]', () => {
      const out = coerceFormValues(
        [CheckboxListField.make('cats')],
        { cats: ['news', 'guides'] },
      )
      assert.deepEqual(out['cats'], ['news', 'guides'])
    })

    it('single string body → [string]', () => {
      const out = coerceFormValues(
        [CheckboxListField.make('cats')],
        { cats: 'news' },
      )
      assert.deepEqual(out['cats'], ['news'])
    })

    it('missing body key → empty array', () => {
      const out = coerceFormValues([CheckboxListField.make('cats')], {})
      assert.deepEqual(out['cats'], [])
    })

    it('null body → empty array', () => {
      const out = coerceFormValues(
        [CheckboxListField.make('cats')],
        { cats: null },
      )
      assert.deepEqual(out['cats'], [])
    })

    it('non-string array values are stringified', () => {
      const out = coerceFormValues(
        [CheckboxListField.make('ids')],
        { ids: [1, 2, 3] },
      )
      assert.deepEqual(out['ids'], ['1', '2', '3'])
    })
  })

  describe('async resolver', () => {
    it('runs the resolver against ctx', async () => {
      const f = CheckboxListField.make('opts').options(({ $get }) => {
        return $get?.('mode') === 'pro'
          ? [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
          : [{ value: 'a', label: 'A' }]
      })
      const meta = await f.toMeta({
        values: { mode: 'pro' },
        $get:   (n) => ({ mode: 'pro' } as Record<string, unknown>)[n],
      })
      assert.deepEqual(meta['options'], [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ])
    })
  })
})
