import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clampGridColumns } from './GridExtension.js'

describe('clampGridColumns', () => {
  it('passes through 2 and 3', () => {
    assert.equal(clampGridColumns(2), 2)
    assert.equal(clampGridColumns(3), 3)
  })

  it('falls back to 2 for 1', () => {
    assert.equal(clampGridColumns(1), 2)
  })

  it('falls back to 2 for 4+ / NaN / negative / undefined / non-numeric strings', () => {
    assert.equal(clampGridColumns(4),         2)
    assert.equal(clampGridColumns(99),        2)
    assert.equal(clampGridColumns(NaN),       2)
    assert.equal(clampGridColumns(-1),        2)
    assert.equal(clampGridColumns(undefined), 2)
    assert.equal(clampGridColumns(null),      2)
    assert.equal(clampGridColumns(''),        2)
    assert.equal(clampGridColumns('abc'),     2)
  })

  it('coerces numeric strings before clamping', () => {
    assert.equal(clampGridColumns('2'), 2)
    assert.equal(clampGridColumns('3'), 3)
    assert.equal(clampGridColumns('4'), 2)
  })
})
