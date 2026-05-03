import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { encodeCsv, parseCsv } from './csv.js'

describe('encodeCsv', () => {
  it('emits header row + body rows separated by CRLF', () => {
    const out = encodeCsv(
      [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }],
      [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }],
    )
    assert.equal(out, 'ID,Name\r\n1,Ada\r\n2,Grace\r\n')
  })

  it('falls back to key when label is omitted', () => {
    const out = encodeCsv([{ id: 1 }], [{ key: 'id' }])
    assert.equal(out, 'id\r\n1\r\n')
  })

  it('header-only output when rows are empty (no trailing CRLF)', () => {
    const out = encodeCsv([], [{ key: 'id', label: 'ID' }, { key: 'name' }])
    assert.equal(out, 'ID,name')
  })

  it('returns empty string when columns are empty', () => {
    assert.equal(encodeCsv([{ id: 1 }], []), '')
  })

  it('null / undefined / missing keys → empty cell', () => {
    const out = encodeCsv(
      [{ a: null, b: undefined }],
      [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
    )
    assert.equal(out, 'a,b,c\r\n,,\r\n')
  })

  it('Date values serialize as ISO 8601', () => {
    const d = new Date('2026-05-03T14:00:00.000Z')
    const out = encodeCsv([{ at: d }], [{ key: 'at' }])
    assert.equal(out, 'at\r\n2026-05-03T14:00:00.000Z\r\n')
  })

  it('numbers, booleans, bigints serialize via String()', () => {
    const out = encodeCsv(
      [{ n: 42, b: true, big: 9007199254740993n }],
      [{ key: 'n' }, { key: 'b' }, { key: 'big' }],
    )
    assert.equal(out, 'n,b,big\r\n42,true,9007199254740993\r\n')
  })

  it('quotes cells containing comma / quote / newline / leading or trailing whitespace', () => {
    const out = encodeCsv(
      [{ a: 'has, comma', b: 'has "quote"', c: 'line\nbreak', d: ' padded ' }],
      [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }],
    )
    assert.equal(
      out,
      'a,b,c,d\r\n"has, comma","has ""quote""","line\nbreak"," padded "\r\n',
    )
  })

  it('plain values without special characters do not get quoted', () => {
    const out = encodeCsv([{ a: 'hello' }], [{ key: 'a' }])
    assert.equal(out, 'a\r\nhello\r\n')
  })

  it('object values fall back to JSON.stringify', () => {
    const out = encodeCsv([{ meta: { x: 1 } }], [{ key: 'meta' }])
    assert.equal(out, 'meta\r\n"{""x"":1}"\r\n')
  })
})

describe('parseCsv', () => {
  it('parses headers + body into objects keyed by header', () => {
    const r = parseCsv('id,name\r\n1,Ada\r\n2,Grace\r\n')
    assert.deepEqual(r.headers, ['id', 'name'])
    assert.deepEqual(r.rows, [
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Grace' },
    ])
  })

  it('tolerates LF-only line endings', () => {
    const r = parseCsv('a,b\n1,2\n3,4')
    assert.deepEqual(r.rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('strips a UTF-8 BOM', () => {
    const r = parseCsv('﻿id\r\n42\r\n')
    assert.deepEqual(r.headers, ['id'])
    assert.deepEqual(r.rows, [{ id: '42' }])
  })

  it('drops a trailing empty line', () => {
    const r = parseCsv('id\r\n1\r\n2\r\n\r\n')
    assert.deepEqual(r.rows, [{ id: '1' }, { id: '2' }])
  })

  it('handles unquoted, quoted, and mixed cells', () => {
    const r = parseCsv('a,b,c\r\nplain,"has, comma","line\nbreak"\r\n')
    assert.deepEqual(r.rows, [{ a: 'plain', b: 'has, comma', c: 'line\nbreak' }])
  })

  it('decodes "" → " inside a quoted cell', () => {
    const r = parseCsv('a\r\n"he said ""hi"""\r\n')
    assert.deepEqual(r.rows, [{ a: 'he said "hi"' }])
  })

  it('treats every cell as a string (no type inference)', () => {
    const r = parseCsv('n,b,d\r\n42,true,2026-05-03\r\n')
    assert.deepEqual(r.rows, [{ n: '42', b: 'true', d: '2026-05-03' }])
  })

  it('row with fewer cells than headers fills with empty string', () => {
    const r = parseCsv('a,b,c\r\n1,2\r\n')
    assert.deepEqual(r.rows, [{ a: '1', b: '2', c: '' }])
  })

  it('row with extra cells silently drops them', () => {
    const r = parseCsv('a,b\r\n1,2,3,4\r\n')
    assert.deepEqual(r.rows, [{ a: '1', b: '2' }])
  })

  it('throws on empty input', () => {
    assert.throws(() => parseCsv(''),  /empty input/)
    assert.throws(() => parseCsv('  '), /empty input/)
  })

  it('throws on unterminated quoted cell at EOF', () => {
    assert.throws(() => parseCsv('a\r\n"unclosed'), /unterminated/)
  })

  it('round-trip — encode then parse recovers row data as strings', () => {
    const rows = [
      { id: '1', name: 'has, comma',  body: 'multi\nline' },
      { id: '2', name: 'plain',       body: 'with "quotes"' },
    ]
    const csv = encodeCsv(rows, [{ key: 'id' }, { key: 'name' }, { key: 'body' }])
    const parsed = parseCsv(csv)
    assert.deepEqual(parsed.rows, rows)
  })
})
