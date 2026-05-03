import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextInputColumn, ToggleColumn, SelectColumn } from '../columns/index.js'
import { coerceCellValue, CellCoerceError } from './coerce.js'

describe('coerceCellValue — TextInputColumn', () => {
  it('passes string values through unchanged for type=text', () => {
    const col = TextInputColumn.make('title')
    assert.equal(coerceCellValue(col, 'hello'), 'hello')
    assert.equal(coerceCellValue(col, ''),      '')
  })

  it('coerces numeric input to JS number when type=number', () => {
    const col = TextInputColumn.make('price').type('number')
    assert.equal(coerceCellValue(col, '42'),   42)
    assert.equal(coerceCellValue(col, '3.14'), 3.14)
    assert.equal(coerceCellValue(col, 7),      7)
  })

  it('returns null for empty number input (clear semantic)', () => {
    const col = TextInputColumn.make('price').type('number')
    assert.equal(coerceCellValue(col, ''),   null)
    assert.equal(coerceCellValue(col, null), null)
  })

  it('throws CellCoerceError for non-numeric strings on type=number', () => {
    const col = TextInputColumn.make('price').type('number')
    assert.throws(() => coerceCellValue(col, 'abc'), CellCoerceError)
  })

  it('survives null for non-numeric text input (cell cleared)', () => {
    const col = TextInputColumn.make('title')
    assert.equal(coerceCellValue(col, null), null)
  })
})

describe('coerceCellValue — ToggleColumn', () => {
  it('accepts native booleans verbatim', () => {
    const col = ToggleColumn.make('featured')
    assert.equal(coerceCellValue(col, true),  true)
    assert.equal(coerceCellValue(col, false), false)
  })

  it('parses stringified truthy / falsy markers', () => {
    const col = ToggleColumn.make('featured')
    assert.equal(coerceCellValue(col, 'true'),  true)
    assert.equal(coerceCellValue(col, '1'),     true)
    assert.equal(coerceCellValue(col, 'on'),    true)
    assert.equal(coerceCellValue(col, 'false'), false)
    assert.equal(coerceCellValue(col, '0'),     false)
    assert.equal(coerceCellValue(col, ''),      false)
  })

  it('coerces numbers via !==0 like the JS truthiness rule', () => {
    const col = ToggleColumn.make('featured')
    assert.equal(coerceCellValue(col, 1), true)
    assert.equal(coerceCellValue(col, 0), false)
  })
})

describe('coerceCellValue — SelectColumn', () => {
  it('returns the value unchanged when it matches an option', () => {
    const col = SelectColumn.make('status').options({ draft: 'Draft', published: 'Published' })
    assert.equal(coerceCellValue(col, 'draft'),     'draft')
    assert.equal(coerceCellValue(col, 'published'), 'published')
  })

  it('throws on values not in the option set', () => {
    const col = SelectColumn.make('status').options({ draft: 'Draft' })
    assert.throws(() => coerceCellValue(col, 'forged'), CellCoerceError)
  })

  it('rejects empty / null when the column is NOT nullable', () => {
    const col = SelectColumn.make('status').options({ draft: 'Draft' })
    assert.throws(() => coerceCellValue(col, null), CellCoerceError)
    assert.throws(() => coerceCellValue(col, ''),   CellCoerceError)
  })

  it('returns null for empty / null when the column IS nullable', () => {
    const col = SelectColumn.make('status').options({ draft: 'Draft' }).nullable()
    assert.equal(coerceCellValue(col, null), null)
    assert.equal(coerceCellValue(col, ''),   null)
  })
})
