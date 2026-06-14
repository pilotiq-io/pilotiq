import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  upsertSuggestion,
  upsertSuggestions,
  removeSuggestion,
  remapSuggestions,
  sortForApproveAll,
  clampPos,
  type InlineSuggestion,
} from './SuggestionChipExtension.js'

const make = (id: string, from: number, to: number, replacement = '…'): InlineSuggestion => ({
  id, from, to, replacement,
})

describe('upsertSuggestion', () => {
  it('appends a new suggestion when id is unseen', () => {
    const list = [make('a', 0, 4)]
    const out  = upsertSuggestion(list, make('b', 8, 12))
    assert.equal(out.length, 2)
    assert.equal(out[1]!.id, 'b')
  })

  it('replaces in place when id already exists', () => {
    const list = [make('a', 0, 4, 'old'), make('b', 8, 12, 'old')]
    const out  = upsertSuggestion(list, make('a', 0, 4, 'new'))
    assert.equal(out.length, 2)
    assert.equal(out[0]!.replacement, 'new')
    assert.equal(out[1]!.id, 'b')
  })

  it('does not mutate the input array', () => {
    const list = [make('a', 0, 4)]
    upsertSuggestion(list, make('b', 8, 12))
    assert.equal(list.length, 1)
  })
})

describe('upsertSuggestions', () => {
  it('folds multiple inserts and replacements', () => {
    const list = [make('a', 0, 4, 'old')]
    const out  = upsertSuggestions(list, [
      make('a', 0, 4, 'new'),
      make('b', 8, 12),
      make('c', 16, 20),
    ])
    assert.deepEqual(out.map(s => s.id), ['a', 'b', 'c'])
    assert.equal(out[0]!.replacement, 'new')
  })
})

describe('removeSuggestion', () => {
  it('drops only the matching id', () => {
    const list = [make('a', 0, 4), make('b', 8, 12)]
    const out  = removeSuggestion(list, 'a')
    assert.deepEqual(out.map(s => s.id), ['b'])
  })

  it('returns the same shape when id is unseen', () => {
    const list = [make('a', 0, 4)]
    const out  = removeSuggestion(list, 'unseen')
    assert.deepEqual(out, list)
  })
})

describe('remapSuggestions', () => {
  it('shifts ranges through a forward-shift mapping', () => {
    const list = [make('a', 10, 14)]
    const out  = remapSuggestions(list, (pos) => pos + 5)
    assert.equal(out[0]!.from, 15)
    assert.equal(out[0]!.to,   19)
  })

  it('drops ranges that collapsed past each other', () => {
    const list = [make('a', 10, 14), make('b', 20, 24)]
    // Map collapses everything to position 0 — `to (-1 in mapping bias) < from`.
    const out  = remapSuggestions(list, (pos, side) => (side === -1 ? pos : 0))
    assert.equal(out.length, 0)
  })

  it('keeps a pure-insertion range (`from === to`) when it survives the mapping', () => {
    const list = [{ ...make('a', 5, 5), replacement: 'inserted' }]
    const out  = remapSuggestions(list, (pos) => pos + 3)
    assert.equal(out.length, 1)
    assert.equal(out[0]!.from, 8)
    assert.equal(out[0]!.to,   8)
  })

  it('biases sides — `from` left, `to` right — to keep insertions stable under collapsed text', () => {
    const list = [make('a', 5, 10)]
    // A mapping that collapses at exactly `pos = 5` — left bias keeps `from`
    // anchored at 5; right bias for `to = 10` shifts it to 10. Range survives.
    const out = remapSuggestions(list, (pos, side) => {
      if (pos === 5  && side === -1) return 5
      if (pos === 5  && side ===  1) return 7
      if (pos === 10 && side === -1) return 7
      if (pos === 10 && side ===  1) return 10
      return pos
    })
    assert.equal(out.length, 1)
    assert.equal(out[0]!.from, 5)
    assert.equal(out[0]!.to,   10)
  })
})

describe('sortForApproveAll', () => {
  it('orders highest-`from` first so earlier positions are stable across replacements', () => {
    const list = [make('a', 0, 4), make('c', 20, 24), make('b', 10, 14)]
    const out  = sortForApproveAll(list)
    assert.deepEqual(out.map(s => s.id), ['c', 'b', 'a'])
  })

  it('does not mutate the input', () => {
    const list = [make('a', 0, 4), make('b', 10, 14)]
    sortForApproveAll(list)
    assert.deepEqual(list.map(s => s.id), ['a', 'b'])
  })
})

describe('clampPos', () => {
  it('passes through positions within range', () => {
    assert.equal(clampPos(5, 10), 5)
    assert.equal(clampPos(0, 10), 0)
    assert.equal(clampPos(10, 10), 10)
  })

  it('floors negatives at 0 and ceils overshoots at max', () => {
    assert.equal(clampPos(-5, 10), 0)
    assert.equal(clampPos(99, 10), 10)
  })

  it('returns 0 for non-finite input', () => {
    assert.equal(clampPos(NaN, 10),      0)
    assert.equal(clampPos(Infinity, 10), 0)
  })

  it('truncates fractional positions', () => {
    assert.equal(clampPos(3.7, 10), 3)
  })
})
