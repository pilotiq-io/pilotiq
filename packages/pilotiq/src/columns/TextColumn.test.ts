import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextColumn } from './TextColumn.js'
import { Column } from '../Column.js'

describe('TextColumn', () => {
  it('toMeta omits columnType (text is the default)', () => {
    const meta = TextColumn.make('title').toMeta()
    assert.equal(meta.type, 'column')
    assert.equal(meta.name, 'title')
    // 'text' is the default columnType — kept off the wire to keep meta tidy.
    assert.equal(meta.columnType, undefined)
  })

  it('inherits the full base-column chain', () => {
    const meta = TextColumn.make('a')
      .label('A')
      .sortable()
      .searchable()
      .alignment('end')
      .width('120px')
      .default('—')
      .tooltip('Help')
      .wrap()
      .lineClamp(2)
      .weight('semibold')
      .color('muted')
      .toMeta()
    assert.equal(meta.label,     'A')
    assert.equal(meta.sortable,  true)
    assert.equal(meta.alignment, 'end')
    assert.equal(meta.width,     '120px')
    assert.equal(meta.default,   '—')
    assert.equal(meta.tooltip,   'Help')
    assert.equal(meta.wrap,      true)
    assert.equal(meta.lineClamp, 2)
    assert.equal(meta.weight,    'semibold')
    assert.equal(meta.color,     'muted')
  })

  describe('built-in formatters', () => {
    it('dateTime() emits format spec', () => {
      const meta = TextColumn.make('publishedAt').dateTime().toMeta()
      assert.deepEqual(meta.format, { kind: 'dateTime' })
    })

    it('dateTime("PPpp") carries the pattern', () => {
      const meta = TextColumn.make('publishedAt').dateTime('PPpp').toMeta()
      assert.deepEqual(meta.format, { kind: 'dateTime', pattern: 'PPpp' })
    })

    it('since() emits kind:since', () => {
      const meta = TextColumn.make('createdAt').since().toMeta()
      assert.deepEqual(meta.format, { kind: 'since' })
    })

    it('money(currency) emits kind:money + currency', () => {
      const meta = TextColumn.make('price').money('USD').toMeta()
      assert.deepEqual(meta.format, { kind: 'money', currency: 'USD' })
    })

    it('money(currency, locale) carries the locale', () => {
      const meta = TextColumn.make('price').money('EUR', 'de-DE').toMeta()
      assert.deepEqual(meta.format, { kind: 'money', currency: 'EUR', locale: 'de-DE' })
    })

    it('numeric() with no opts emits bare kind:numeric', () => {
      const meta = TextColumn.make('count').numeric().toMeta()
      assert.deepEqual(meta.format, { kind: 'numeric' })
    })

    it('numeric({ decimals }) carries decimals', () => {
      const meta = TextColumn.make('count').numeric({ decimals: 2 }).toMeta()
      assert.deepEqual(meta.format, { kind: 'numeric', decimals: 2 })
    })

    it('limit(n) emits kind:limit + chars', () => {
      const meta = TextColumn.make('body').limit(40).toMeta()
      assert.deepEqual(meta.format, { kind: 'limit', chars: 40 })
    })
  })

  it('formatStateUsing stamps hasFormatter:true on the meta', () => {
    const col = TextColumn.make('priority').formatStateUsing((v) => `★ ${v}`)
    const meta = col.toMeta()
    assert.equal(meta.hasFormatter, true)
    assert.equal(col.hasFormatter(), true)
  })

  it('Column.make and TextColumn.make produce equivalent meta', () => {
    // Plan §44: `Column.make()` is an alias for `TextColumn.make()`. The
    // wire shape must stay identical so existing code keeps working.
    const a = Column.make('title').label('Title').sortable().toMeta()
    const b = TextColumn.make('title').label('Title').sortable().toMeta()
    assert.deepEqual(a, b)
  })
})
