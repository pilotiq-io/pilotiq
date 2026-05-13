import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeDelta, preserveCursor } from './textDelta.js'

describe('computeDelta — string-diff to TextDelta', () => {
  it('returns null for identical strings', () => {
    assert.equal(computeDelta('hello', 'hello'), null)
    assert.equal(computeDelta('', ''),           null)
  })

  it('emits insert when text is appended', () => {
    assert.deepEqual(
      computeDelta('hello', 'hello!'),
      { kind: 'insert', index: 5, text: '!' },
    )
  })

  it('emits insert when text is prepended', () => {
    assert.deepEqual(
      computeDelta('world', 'hello world'),
      { kind: 'insert', index: 0, text: 'hello ' },
    )
  })

  it('emits insert when text is spliced mid-string', () => {
    // Inserting an 'l' to make 'helo' → 'hello'. The longest common
    // prefix is 'hel' (3 chars — before[2]='l' and after[2]='l' both
    // match), so the insertion lands at index 3. Either interpretation
    // (index 2 or index 3) produces the same CRDT result; the diff
    // picks the rightmost feasible point deterministically.
    assert.deepEqual(
      computeDelta('helo', 'hello'),
      { kind: 'insert', index: 3, text: 'l' },
    )
  })

  it('emits delete when a trailing run is removed', () => {
    assert.deepEqual(
      computeDelta('hello!', 'hello'),
      { kind: 'delete', index: 5, length: 1 },
    )
  })

  it('emits delete when a leading run is removed', () => {
    assert.deepEqual(
      computeDelta('hello world', 'world'),
      { kind: 'delete', index: 0, length: 6 },
    )
  })

  it('emits delete when a mid-string run is removed', () => {
    assert.deepEqual(
      computeDelta('hello', 'hlo'),
      { kind: 'delete', index: 1, length: 2 },
    )
  })

  it('emits replace when a mid-string selection is swapped', () => {
    assert.deepEqual(
      computeDelta('hello world', 'hello pilot'),
      { kind: 'replace', from: 6, to: 11, text: 'pilot' },
    )
  })

  it('emits replace when the whole string is swapped', () => {
    assert.deepEqual(
      computeDelta('foo', 'bar'),
      { kind: 'replace', from: 0, to: 3, text: 'bar' },
    )
  })

  it('emits insert when growing from empty', () => {
    assert.deepEqual(
      computeDelta('', 'a'),
      { kind: 'insert', index: 0, text: 'a' },
    )
  })

  it('emits delete when shrinking to empty', () => {
    assert.deepEqual(
      computeDelta('abc', ''),
      { kind: 'delete', index: 0, length: 3 },
    )
  })

  it('handles repeated-char shrink without prefix/suffix overlap', () => {
    // 'aaa' → 'aa' — the prefix walk could greedily eat all 2 chars from
    // the after side; the suffix cap must stop suffix at 2 so beforeMid
    // is 'a' (length 1) instead of '' (length 0, identity).
    assert.deepEqual(
      computeDelta('aaa', 'aa'),
      { kind: 'delete', index: 2, length: 1 },
    )
  })
})

describe('preserveCursor — anchor across remote edits', () => {
  it('returns input cursor when strings are identical', () => {
    assert.equal(preserveCursor('hello', 'hello', 3), 3)
  })

  it('leaves cursor untouched when edit lands AFTER cursor', () => {
    // Cursor at index 2 ('he|llo'); remote appends ' world'. Edit prefix
    // length is 5, cursor 2 ≤ prefix → no shift.
    assert.equal(preserveCursor('hello', 'hello world', 2), 2)
  })

  it('shifts cursor when edit lands BEFORE cursor', () => {
    // Cursor at 5 ('hello|'); remote prepends 'XX '. The common prefix
    // is empty, so cursor > prefix → shift by (8 − 5) = 3, landing at
    // 8 (the end of the new string, same logical position as before).
    assert.equal(preserveCursor('hello', 'XX hello', 5), 8)
  })

  it('lands at end-of-string for non-contiguous edits (heuristic limit)', () => {
    // Both-sides insertion ('hello' → 'X hello world') flattens into a
    // single full-string `replace` at the diff layer because the prefix
    // and suffix walks find no common ground. Cursor lands at the end
    // of the new string — imperfect for this case but harmless. A
    // future v2 using Yjs `RelativePosition` would land it at 7
    // (just after the original 'hello' substring).
    assert.equal(preserveCursor('hello', 'X hello world', 5), 13)
  })

  it('clamps cursor when remote deletes around the cursor', () => {
    // Cursor at 5 ('hello|world'); remote deletes 'hello'. Prefix is 0,
    // delta is -5 → shifted to 0.
    assert.equal(preserveCursor('helloworld', 'world', 5), 0)
  })

  it('never returns a negative cursor', () => {
    assert.equal(preserveCursor('abcdef', '', 3), 0)
  })

  it('never returns a cursor past the new length', () => {
    // Defensive — caller might pass a stale cursor longer than the new
    // string. Clamp to new bounds.
    assert.equal(preserveCursor('hello', 'hi', 10), 2)
  })
})
