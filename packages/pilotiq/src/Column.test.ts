import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Column } from './Column.js'
import { resolveSchema } from './schema/resolveSchema.js'

describe('Column', () => {
  it('toMeta emits type=column with name + label + flags', () => {
    const meta = Column.make('title').label('Title').sortable().searchable().toMeta()
    assert.deepEqual(meta, {
      type:       'column',
      name:       'title',
      label:      'Title',
      sortable:   true,
      searchable: true,
    })
  })

  it('label defaults to capitalized name when not set', () => {
    const meta = Column.make('createdAt').toMeta()
    assert.equal(meta.label, 'CreatedAt')
  })

  it('sortable / searchable default to false', () => {
    const meta = Column.make('x').toMeta()
    assert.equal(meta.sortable, false)
    assert.equal(meta.searchable, false)
  })

  it('joins the resolver tree as a leaf Element', async () => {
    const result = await resolveSchema([Column.make('title')])
    assert.equal(result.length, 1)
    assert.equal(result[0]!.type, 'column')
    assert.equal('children' in result[0]!, false)
  })

  describe('layout & cosmetics', () => {
    it('alignment / width / default / tooltip / wrap / lineClamp / weight / color round-trip', () => {
      const meta = Column.make('a')
        .alignment('center')
        .width('120px')
        .default('—')
        .tooltip('Help')
        .wrap()
        .lineClamp(2)
        .weight('semibold')
        .color('muted')
        .toMeta()
      assert.equal(meta.alignment, 'center')
      assert.equal(meta.width,     '120px')
      assert.equal(meta.default,   '—')
      assert.equal(meta.tooltip,   'Help')
      assert.equal(meta.wrap,      true)
      assert.equal(meta.lineClamp, 2)
      assert.equal(meta.weight,    'semibold')
      assert.equal(meta.color,     'muted')
    })

    it('placeholder() is an alias for default()', () => {
      const meta = Column.make('a').placeholder('—').toMeta()
      assert.equal(meta.default, '—')
    })

    it('cosmetic builders are absent from meta when not called', () => {
      const meta = Column.make('a').toMeta()
      assert.equal(meta.alignment, undefined)
      assert.equal(meta.width,     undefined)
      assert.equal(meta.tooltip,   undefined)
      assert.equal(meta.wrap,      undefined)
      assert.equal(meta.color,     undefined)
    })
  })

  describe('built-in formatters', () => {
    it('dateTime() with default pattern', () => {
      const meta = Column.make('createdAt').dateTime().toMeta()
      assert.deepEqual(meta.format, { kind: 'dateTime' })
    })

    it('dateTime("PPpp")', () => {
      const meta = Column.make('createdAt').dateTime('PPpp').toMeta()
      assert.deepEqual(meta.format, { kind: 'dateTime', pattern: 'PPpp' })
    })

    it('since() emits kind:since', () => {
      const meta = Column.make('createdAt').since().toMeta()
      assert.deepEqual(meta.format, { kind: 'since' })
    })

    it('money(currency) emits kind:money + currency', () => {
      const meta = Column.make('amount').money('EUR').toMeta()
      assert.deepEqual(meta.format, { kind: 'money', currency: 'EUR' })
    })

    it('numeric({decimals}) emits kind:numeric + decimals', () => {
      const meta = Column.make('x').numeric({ decimals: 2 }).toMeta()
      assert.deepEqual(meta.format, { kind: 'numeric', decimals: 2 })
    })

    it('limit(n) emits kind:limit + chars', () => {
      const meta = Column.make('body').limit(40).toMeta()
      assert.deepEqual(meta.format, { kind: 'limit', chars: 40 })
    })

    it('formatStateUsing stamps hasFormatter:true on meta', () => {
      const col = Column.make('priority').formatStateUsing((v) => `${v}!`)
      const meta = col.toMeta()
      assert.equal(meta.hasFormatter, true)
      assert.equal(col.hasFormatter(), true)
      assert.equal(typeof col.getFormatStateHandler(), 'function')
    })
  })

  describe('recordUrl per-column override / opt-out', () => {
    it('absent by default — column inherits the table-level recordUrl', () => {
      const col = Column.make('title')
      const meta = col.toMeta()
      assert.equal(meta.recordUrl, undefined)
      assert.equal(col.isRecordUrlDisabled(), false)
      assert.equal(col.hasRecordUrlHandler(), false)
    })

    it('recordUrl(false) emits recordUrl:false on meta', () => {
      const col = Column.make('actions').recordUrl(false)
      const meta = col.toMeta()
      assert.equal(meta.recordUrl, false)
      assert.equal(col.isRecordUrlDisabled(), true)
      assert.equal(col.hasRecordUrlHandler(), false)
    })

    it('recordUrl(fn) emits recordUrl:true on meta and exposes the handler', () => {
      const col = Column.make('title').recordUrl((r) => `/posts/${(r as { id?: string }).id}`)
      const meta = col.toMeta()
      assert.equal(meta.recordUrl, true)
      assert.equal(col.hasRecordUrlHandler(), true)
      assert.equal(col.isRecordUrlDisabled(), false)
      assert.equal(typeof col.getRecordUrlHandler(), 'function')
    })
  })
})
