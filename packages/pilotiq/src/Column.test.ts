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
      assert.equal(meta.visibleFrom, undefined)
      assert.equal(meta.hiddenFrom,  undefined)
    })

    it('visibleFrom / hiddenFrom round-trip and are mutually exclusive', () => {
      const vf = Column.make('slug').visibleFrom('md').toMeta()
      assert.equal(vf.visibleFrom, 'md')
      assert.equal(vf.hiddenFrom,  undefined)

      const hf = Column.make('tags').hiddenFrom('lg').toMeta()
      assert.equal(hf.hiddenFrom,  'lg')
      assert.equal(hf.visibleFrom, undefined)

      // last call wins; the other slot is cleared
      const flip = Column.make('x').visibleFrom('md').hiddenFrom('sm').toMeta()
      assert.equal(flip.hiddenFrom,  'sm')
      assert.equal(flip.visibleFrom, undefined)
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

  describe('beforeStateUpdated / afterStateUpdated accessors', () => {
    it('return undefined when no hooks are set', () => {
      const col = Column.make('title')
      assert.equal(col.getBeforeStateUpdated(), undefined)
      assert.equal(col.getAfterStateUpdated(),  undefined)
    })

    it('return the registered hook function', () => {
      const before = async () => {}
      const after  = () => {}
      const col = Column.make('title').beforeStateUpdated(before).afterStateUpdated(after)
      assert.equal(col.getBeforeStateUpdated(), before)
      assert.equal(col.getAfterStateUpdated(),  after)
    })

    it('hooks are not serialized into the wire shape', () => {
      const col = Column.make('title').beforeStateUpdated(() => {}).afterStateUpdated(() => {})
      const meta = col.toMeta()
      assert.equal((meta as Record<string, unknown>)['beforeStateUpdated'], undefined)
      assert.equal((meta as Record<string, unknown>)['afterStateUpdated'],  undefined)
    })
  })

  describe('toggleable() user-visibility chrome', () => {
    it('isToggleable + getToggleableConfig default to false / undefined', () => {
      const col = Column.make('email')
      assert.equal(col.isToggleable(),         false)
      assert.equal(col.getToggleableConfig(),  undefined)
    })

    it('bare toggleable() opts in with defaults (visible by default)', () => {
      const col = Column.make('email').toggleable()
      assert.equal(col.isToggleable(), true)
      assert.deepEqual(col.getToggleableConfig(), {})
      const meta = col.toMeta() as Record<string, unknown>
      assert.deepEqual(meta['toggleable'], {})
    })

    it('toggleable({ initiallyHidden: true }) starts off-screen', () => {
      const col = Column.make('internalId').toggleable({ initiallyHidden: true })
      const cfg = col.getToggleableConfig()
      assert.equal(cfg?.initiallyHidden, true)
      const meta = col.toMeta() as Record<string, unknown>
      assert.deepEqual(meta['toggleable'], { initiallyHidden: true })
    })

    it('toggleable(false) explicitly opts back out', () => {
      const col = Column.make('email').toggleable().toggleable(false)
      assert.equal(col.isToggleable(), false)
      const meta = col.toMeta() as Record<string, unknown>
      assert.equal(meta['toggleable'], undefined)
    })

    it('omits the meta key when not opted in (sparse wire shape)', () => {
      const meta = Column.make('plain').toMeta() as Record<string, unknown>
      assert.equal('toggleable' in meta, false)
    })
  })
})
