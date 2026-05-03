import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { TextEntry } from './TextEntry.js'
import { Entry, isEntry, type EntryMeta } from './Entry.js'

beforeEach(() => _resetResolverRegistry())

describe('Entry base', () => {
  it('extends Element', () => {
    const e = TextEntry.make('email')
    assert.equal(e.getType(), 'entry')
    assert.equal(e instanceof Entry, true)
    assert.equal(isEntry(e), true)
  })

  it('derives label from camelCase name', async () => {
    const out = await resolveSchema([TextEntry.make('publishedAt')], { record: { publishedAt: '2026-01-01' } })
    assert.equal((out[0] as EntryMeta).label, 'Published At')
  })

  it('derives label from snake_case name', async () => {
    const out = await resolveSchema([TextEntry.make('first_name')], { record: { first_name: 'Ada' } })
    assert.equal((out[0] as EntryMeta).label, 'First name')
  })

  it('derives label from kebab-case name', async () => {
    const out = await resolveSchema([TextEntry.make('first-name')], { record: { 'first-name': 'Ada' } })
    assert.equal((out[0] as EntryMeta).label, 'First name')
  })

  it('label() override wins', async () => {
    const out = await resolveSchema([TextEntry.make('email').label('Contact')], { record: { email: 'a@b.c' } })
    assert.equal((out[0] as EntryMeta).label, 'Contact')
  })
})

describe('TextEntry — state resolution', () => {
  it('reads from ctx.record', async () => {
    const out = await resolveSchema(
      [TextEntry.make('email')],
      { record: { email: 'foo@bar.com' } },
    )
    const meta = out[0] as EntryMeta
    assert.equal(meta.type, 'entry')
    assert.equal(meta.entryType, 'text')
    assert.equal(meta.name, 'email')
    assert.equal(meta.value, 'foo@bar.com')
  })

  it('value undefined when no record', async () => {
    const out = await resolveSchema([TextEntry.make('email')])
    assert.equal((out[0] as EntryMeta).value, undefined)
  })

  it('value undefined when record is missing the attribute', async () => {
    const out = await resolveSchema([TextEntry.make('email')], { record: { name: 'Ada' } })
    assert.equal((out[0] as EntryMeta).value, undefined)
  })
})

describe('TextEntry — chrome', () => {
  it('inlineLabel / default / helperText / tooltip', async () => {
    const out = await resolveSchema(
      [
        TextEntry.make('amount')
          .inlineLabel()
          .default('—')
          .helperText('USD per unit')
          .tooltip('Pre-tax'),
      ],
      { record: { amount: 12 } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.inlineLabel, true)
    assert.equal(m.default,    '—')
    assert.equal(m.helperText, 'USD per unit')
    assert.equal(m.tooltip,    'Pre-tax')
  })

  it('placeholder() is an alias for default()', async () => {
    const out = await resolveSchema([TextEntry.make('x').placeholder('n/a')], { record: { x: null } })
    assert.equal((out[0] as EntryMeta).default, 'n/a')
  })

  it('weight / color / size', async () => {
    const out = await resolveSchema(
      [TextEntry.make('title').weight('semibold').color('primary').size('lg')],
      { record: { title: 'Hello' } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.weight, 'semibold')
    assert.equal(m.color,  'primary')
    assert.equal(m.size,   'lg')
  })

  it('lineClamp / wrap', async () => {
    const out = await resolveSchema(
      [TextEntry.make('body').lineClamp(2), TextEntry.make('body').wrap()],
      { record: { body: 'long' } },
    )
    assert.equal((out[0] as EntryMeta).lineClamp, 2)
    assert.equal((out[1] as EntryMeta).wrap,      true)
  })

  it('chrome flags omitted when not set', async () => {
    const out = await resolveSchema([TextEntry.make('x')], { record: { x: 1 } })
    const m = out[0] as EntryMeta
    assert.equal(m.inlineLabel, undefined)
    assert.equal(m.default,     undefined)
    assert.equal(m.helperText,  undefined)
    assert.equal(m.tooltip,     undefined)
    assert.equal(m.weight,      undefined)
    assert.equal(m.color,       undefined)
    assert.equal(m.size,        undefined)
    assert.equal(m.format,      undefined)
    assert.equal(m.copyable,    undefined)
    assert.equal(m.lineClamp,   undefined)
    assert.equal(m.wrap,        undefined)
    assert.equal(m._formatted,  undefined)
  })
})

describe('TextEntry — built-in formatters', () => {
  it('since()', async () => {
    const out = await resolveSchema([TextEntry.make('createdAt').since()], { record: { createdAt: '2026-01-01' } })
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'since' })
  })

  it('dateTime() — no pattern', async () => {
    const out = await resolveSchema([TextEntry.make('createdAt').dateTime()], { record: { createdAt: '2026-01-01' } })
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'dateTime' })
  })

  it('dateTime("Y-m-d") — with pattern', async () => {
    const out = await resolveSchema([TextEntry.make('createdAt').dateTime('Y-m-d')], { record: { createdAt: '2026-01-01' } })
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'dateTime', pattern: 'Y-m-d' })
  })

  it('money(USD)', async () => {
    const out = await resolveSchema([TextEntry.make('amount').money('USD')], { record: { amount: 100 } })
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'money', currency: 'USD' })
  })

  it('money(EUR, "de-DE")', async () => {
    const out = await resolveSchema(
      [TextEntry.make('amount').money('EUR', 'de-DE')],
      { record: { amount: 100 } },
    )
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'money', currency: 'EUR', locale: 'de-DE' })
  })

  it('numeric({ decimals: 2 })', async () => {
    const out = await resolveSchema(
      [TextEntry.make('amount').numeric({ decimals: 2 })],
      { record: { amount: 1.5 } },
    )
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'numeric', decimals: 2 })
  })

  it('limit(20)', async () => {
    const out = await resolveSchema([TextEntry.make('body').limit(20)], { record: { body: 'a' } })
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'limit', chars: 20 })
  })

  it('the last formatter wins', async () => {
    const out = await resolveSchema(
      [TextEntry.make('createdAt').since().dateTime('Y-m-d')],
      { record: { createdAt: '2026-01-01' } },
    )
    assert.deepEqual((out[0] as EntryMeta).format, { kind: 'dateTime', pattern: 'Y-m-d' })
  })
})

describe('TextEntry — formatStateUsing', () => {
  it('runs at resolve and stamps _formatted', async () => {
    const out = await resolveSchema(
      [TextEntry.make('amount').formatStateUsing((v, r) => `${v} (id=${(r as { id?: number }).id})`)],
      { record: { id: 7, amount: 42 } },
    )
    assert.equal((out[0] as EntryMeta)._formatted, '42 (id=7)')
  })

  it('throwing handler fails soft (no _formatted, no crash)', async () => {
    const out = await resolveSchema(
      [TextEntry.make('amount').formatStateUsing(() => { throw new Error('boom') })],
      { record: { amount: 42 } },
    )
    assert.equal((out[0] as EntryMeta)._formatted, undefined)
  })
})

describe('TextEntry — copyable', () => {
  it('bare copyable() emits empty object', async () => {
    const out = await resolveSchema([TextEntry.make('email').copyable()], { record: { email: 'a@b.c' } })
    assert.deepEqual((out[0] as EntryMeta).copyable, {})
  })

  it('copyable("Copy email") carries the label', async () => {
    const out = await resolveSchema(
      [TextEntry.make('email').copyable('Copy email')],
      { record: { email: 'a@b.c' } },
    )
    assert.deepEqual((out[0] as EntryMeta).copyable, { label: 'Copy email' })
  })
})

describe('TextEntry — layout-level integration', () => {
  it('honors visible(false)', async () => {
    const out = await resolveSchema(
      [TextEntry.make('email').visible(false)],
      { record: { email: 'a@b.c' } },
    )
    assert.equal(out.length, 0)
  })

  it('honors columnSpan() under a parent grid', async () => {
    const out = await resolveSchema(
      [TextEntry.make('email').columnSpan(2)],
      { record: { email: 'a@b.c' } },
    )
    assert.deepEqual((out[0] as EntryMeta)._layout, { columnSpan: 2 })
  })
})
