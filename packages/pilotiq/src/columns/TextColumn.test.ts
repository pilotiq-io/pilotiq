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

    it('words(n) emits kind:words + words', () => {
      const meta = TextColumn.make('body').words(20).toMeta()
      assert.deepEqual(meta.format, { kind: 'words', words: 20 })
    })

    it('characters(n) is a Filament-parity alias for limit(n)', () => {
      const a = TextColumn.make('body').characters(40).toMeta()
      const b = TextColumn.make('body').limit(40).toMeta()
      assert.deepEqual(a.format, b.format)
      assert.deepEqual(a.format, { kind: 'limit', chars: 40 })
    })

    it('formatters overwrite each other — last call wins', () => {
      const meta = TextColumn.make('body').words(10).limit(40).toMeta()
      assert.deepEqual(meta.format, { kind: 'limit', chars: 40 })
    })
  })

  describe('rich-display chrome', () => {
    it('listWithLineBreaks() emits flag only when called', () => {
      const off = TextColumn.make('tags').toMeta()
      const on  = TextColumn.make('tags').listWithLineBreaks().toMeta()
      assert.equal(off['listWithLineBreaks'], undefined)
      assert.equal(on['listWithLineBreaks'],  true)
    })

    it('bulleted() emits flag only when called', () => {
      const off = TextColumn.make('tags').toMeta()
      const on  = TextColumn.make('tags').bulleted().toMeta()
      assert.equal(off['bulleted'], undefined)
      assert.equal(on['bulleted'],  true)
    })

    it('copyMessage() defaults to "Copied!"', () => {
      const meta = TextColumn.make('email').copyMessage().toMeta()
      assert.equal(meta['copyMessage'], 'Copied!')
    })

    it('copyMessage(s) honors the custom toast string', () => {
      const meta = TextColumn.make('email').copyMessage('Email copied').toMeta()
      assert.equal(meta['copyMessage'], 'Email copied')
    })

    it('chrome flags compose with each other and with format()', () => {
      const meta = TextColumn.make('bio')
        .words(20)
        .listWithLineBreaks()
        .bulleted()
        .copyMessage('Done')
        .toMeta()
      assert.deepEqual(meta.format,            { kind: 'words', words: 20 })
      assert.equal(meta['listWithLineBreaks'], true)
      assert.equal(meta['bulleted'],           true)
      assert.equal(meta['copyMessage'],        'Done')
    })
  })

  describe('markdown / html', () => {
    it('markdown() stamps richText: "markdown"', () => {
      const meta = TextColumn.make('body').markdown().toMeta()
      assert.equal(meta['richText'], 'markdown')
    })

    it('html() stamps richText: "html"', () => {
      const meta = TextColumn.make('body').html().toMeta()
      assert.equal(meta['richText'], 'html')
    })

    it('html() and markdown() are mutually exclusive — last call wins', () => {
      const a = TextColumn.make('body').markdown().html().toMeta()
      const b = TextColumn.make('body').html().markdown().toMeta()
      assert.equal(a['richText'], 'html')
      assert.equal(b['richText'], 'markdown')
    })

    it('markdown(false) clears the flag', () => {
      const col = TextColumn.make('body').markdown()
      assert.equal(col.isRichText(), true)
      col.markdown(false)
      assert.equal(col.isRichText(), false)
    })

    it('allowRaw() sets sanitize to false', () => {
      const col = TextColumn.make('body').markdown().allowRaw()
      assert.equal(col.getSanitize(), false)
    })

    it('sanitize(opts) carries the widened config through the accessor', () => {
      const col = TextColumn.make('body').html().sanitize({ allowedTags: ['span'] })
      assert.deepEqual(col.getSanitize(), { allowedTags: ['span'] })
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
