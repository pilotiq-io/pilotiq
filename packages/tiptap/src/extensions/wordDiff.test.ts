import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { wordLevelDiff, tokenizeForWordDiff } from './wordDiff.js'

/** Resolve a CharRange list back to the substrings it covers — readable asserts. */
const slices = (src: string, ranges: ReadonlyArray<readonly [number, number]>): string[] =>
  ranges.map(([s, e]) => src.slice(s, e))

describe('wordLevelDiff (#186 intra-line highlight)', () => {
  it('flags only the changed word in a one-word grammar fix', () => {
    const a = 'What you aet around'
    const b = 'What you eat around'
    const { aRanges, bRanges, similarity } = wordLevelDiff(a, b)
    assert.deepEqual(slices(a, aRanges), ['aet'])
    assert.deepEqual(slices(b, bRanges), ['eat'])
    assert.ok(similarity > 0.7, `similar lines should score high (got ${similarity})`)
  })

  it('isolates a sub-token change (0.0.92 → 0.0.93)', () => {
    const a = '"version": "0.0.92"'
    const b = '"version": "0.0.93"'
    assert.deepEqual(slices(a, wordLevelDiff(a, b).aRanges), ['92'])
    assert.deepEqual(slices(b, wordLevelDiff(a, b).bRanges), ['93'])
  })

  it('returns no ranges and similarity 1 for identical text', () => {
    const r = wordLevelDiff('same text', 'same text')
    assert.deepEqual(r.aRanges, [])
    assert.deepEqual(r.bRanges, [])
    assert.equal(r.similarity, 1)
  })

  it('scores unrelated lines low (gate skips them)', () => {
    const r = wordLevelDiff('the quick brown fox', 'totally different content here')
    assert.ok(r.similarity < 0.4, `unrelated lines should score low (got ${r.similarity})`)
  })

  it('does not emit a range for a pure whitespace change', () => {
    const a = 'one two'
    const b = 'one  two' // doubled space
    assert.deepEqual(wordLevelDiff(a, b).aRanges, [])
    assert.deepEqual(wordLevelDiff(a, b).bRanges, [])
  })

  it('emits separate ranges for two non-adjacent edits', () => {
    const a = 'the quick brown fox'
    const b = 'the slow brown cat'
    assert.deepEqual(slices(a, wordLevelDiff(a, b).aRanges), ['quick', 'fox'])
    assert.deepEqual(slices(b, wordLevelDiff(a, b).bRanges), ['slow', 'cat'])
  })

  it('tokenizes word / whitespace / punctuation runs with offsets', () => {
    const toks = tokenizeForWordDiff('a.b c')
    assert.deepEqual(toks.map(t => t.text), ['a', '.', 'b', ' ', 'c'])
    assert.deepEqual(toks.map(t => t.start), [0, 1, 2, 3, 4])
  })
})
