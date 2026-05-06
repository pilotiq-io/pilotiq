import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { RepeatableEntry } from './RepeatableEntry.js'
import { TextEntry }       from './TextEntry.js'
import { BadgeEntry }      from './BadgeEntry.js'
import type { ElementMeta } from '../schema/Element.js'
import type { EntryMeta }   from './Entry.js'

beforeEach(() => _resetResolverRegistry())

describe('RepeatableEntry', () => {
  it('serializes the discriminator + chrome', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items').schema([TextEntry.make('label')])],
      { record: { items: [{ label: 'A' }, { label: 'B' }] } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'repeatable')
    assert.equal(m.label,     'Items')
  })

  it('resolves one row per array element with row-scoped record', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items').schema([
        TextEntry.make('label'),
        BadgeEntry.make('status'),
      ])],
      { record: { items: [
        { label: 'Item A', status: 'draft' },
        { label: 'Item B', status: 'published' },
      ] } },
    )
    const m = out[0] as ElementMeta & { rows: Array<{ id: string; children: ElementMeta[] }> }
    assert.equal(m.rows.length, 2)
    assert.equal(m.rows[0]!.children.length, 2)
    // Row 0: TextEntry resolved against { label: 'Item A', status: 'draft' }
    assert.equal((m.rows[0]!.children[0] as ElementMeta)['value'], 'Item A')
    assert.equal((m.rows[0]!.children[1] as ElementMeta)['value'], 'draft')
    // Row 1
    assert.equal((m.rows[1]!.children[0] as ElementMeta)['value'], 'Item B')
    assert.equal((m.rows[1]!.children[1] as ElementMeta)['value'], 'published')
  })

  it('emits empty rows when the record value is missing / null / non-array', async () => {
    const cases: Array<unknown> = [undefined, null, 'not-an-array', 42, {}]
    for (const value of cases) {
      const out = await resolveSchema(
        [RepeatableEntry.make('items').schema([TextEntry.make('label')])],
        { record: { items: value } },
      )
      const m = out[0] as ElementMeta & { rows: unknown[] }
      assert.deepEqual(m.rows, [], `expected empty rows for ${JSON.stringify(value)}`)
    }
  })

  it('emits empty rows when the array is empty', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items').schema([TextEntry.make('label')])],
      { record: { items: [] } },
    )
    const m = out[0] as ElementMeta & { rows: unknown[] }
    assert.deepEqual(m.rows, [])
  })

  it('reads stable ids off id / __id / uuid; falls back to fieldName-index', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items').schema([TextEntry.make('label')])],
      { record: { items: [
        { id: 7,         label: 'A' },
        { __id: 'x-9',   label: 'B' },
        { uuid: 'u-3',   label: 'C' },
        { label: 'D' }, // no id-ish field
      ] } },
    )
    const m = out[0] as ElementMeta & { rows: Array<{ id: string }> }
    assert.equal(m.rows[0]!.id, '7')
    assert.equal(m.rows[1]!.id, 'x-9')
    assert.equal(m.rows[2]!.id, 'u-3')
    assert.equal(m.rows[3]!.id, 'items-3')
  })

  it('emits columns / grid / table chrome only when configured', async () => {
    const bare = await resolveSchema(
      [RepeatableEntry.make('items').schema([TextEntry.make('label')])],
      { record: { items: [{ label: 'A' }] } },
    )
    const m0 = bare[0] as ElementMeta & {
      columns?: number; grid?: number; table?: unknown; contained?: boolean
    }
    assert.equal(m0.columns,   undefined)
    assert.equal(m0.grid,      undefined)
    assert.equal(m0.table,     undefined)
    assert.equal(m0.contained, undefined)

    const styled = await resolveSchema(
      [
        RepeatableEntry.make('items')
          .schema([TextEntry.make('label')])
          .columns(2)
          .grid(3)
          .contained(false),
      ],
      { record: { items: [{ label: 'A' }] } },
    )
    const m1 = styled[0] as ElementMeta & {
      columns?: number; grid?: number; contained?: boolean
    }
    assert.equal(m1.columns,   2)
    assert.equal(m1.grid,      3)
    assert.equal(m1.contained, false)
  })

  it('grid(n<2) clears the grid mode', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items').schema([TextEntry.make('label')]).grid(3).grid(1)],
      { record: { items: [{ label: 'A' }] } },
    )
    const m = out[0] as ElementMeta & { grid?: number }
    assert.equal(m.grid, undefined)
  })

  it('table(...) emits the column descriptors', async () => {
    const out = await resolveSchema(
      [
        RepeatableEntry.make('items')
          .schema([TextEntry.make('label'), TextEntry.make('qty').numeric()])
          .table([
            { label: 'Item' },
            { label: 'Qty', alignment: 'right', width: '6rem' },
          ]),
      ],
      { record: { items: [{ label: 'A', qty: 1 }] } },
    )
    const m = out[0] as ElementMeta & {
      table?: { columns: Array<{ label: string; alignment?: string; width?: string }> }
    }
    assert.equal(m.table?.columns.length, 2)
    assert.equal(m.table?.columns[0]?.label, 'Item')
    assert.equal(m.table?.columns[1]?.alignment, 'right')
    assert.equal(m.table?.columns[1]?.width,     '6rem')
  })

  it('table([]) clears table mode', async () => {
    const out = await resolveSchema(
      [
        RepeatableEntry.make('items')
          .schema([TextEntry.make('label')])
          .table([{ label: 'X' }])
          .table([]),
      ],
      { record: { items: [{ label: 'A' }] } },
    )
    const m = out[0] as ElementMeta & { table?: unknown }
    assert.equal(m.table, undefined)
  })

  it('inner formatStateUsing runs per row against the row record', async () => {
    const out = await resolveSchema(
      [
        RepeatableEntry.make('items').schema([
          TextEntry.make('amount').formatStateUsing(v => `$${Number(v).toFixed(2)}`),
        ]),
      ],
      { record: { items: [
        { amount: 10 },
        { amount: 12.5 },
      ] } },
    )
    const m = out[0] as ElementMeta & { rows: Array<{ children: ElementMeta[] }> }
    assert.equal((m.rows[0]!.children[0] as ElementMeta)['_formatted'], '$10.00')
    assert.equal((m.rows[1]!.children[0] as ElementMeta)['_formatted'], '$12.50')
  })

  it('primitive array elements stash under `_value` so an inner _value entry can target them', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('tags').schema([TextEntry.make('_value').label('Tag')])],
      { record: { tags: ['featured', 'sale', 'new'] } },
    )
    const m = out[0] as ElementMeta & { rows: Array<{ children: ElementMeta[] }> }
    assert.equal(m.rows.length, 3)
    assert.equal((m.rows[0]!.children[0] as ElementMeta)['value'], 'featured')
    assert.equal((m.rows[2]!.children[0] as ElementMeta)['value'], 'new')
  })

  it('inherits Entry chrome — label / inlineLabel / helperText / default', async () => {
    const out = await resolveSchema(
      [
        RepeatableEntry.make('items')
          .label('Line items')
          .inlineLabel()
          .helperText('From the original PO')
          .default('No items')
          .schema([TextEntry.make('label')]),
      ],
      { record: { items: [{ label: 'A' }] } },
    )
    const m = out[0] as ElementMeta
    assert.equal(m['label'],       'Line items')
    assert.equal(m['inlineLabel'], true)
    assert.equal(m['helperText'],  'From the original PO')
    assert.equal(m['default'],     'No items')
  })

  it('accepts a custom state() resolver for the array source', async () => {
    const out = await resolveSchema(
      [
        RepeatableEntry.make('lines')
          .state((r: Record<string, unknown>) => r['nested'] as unknown[])
          .schema([TextEntry.make('label')]),
      ],
      // No top-level `lines` key — the resolver pulls from `nested` instead.
      // Note: state() only feeds `EntryMeta.value`. The row source is read
      // directly off `record[name]`, so this scenario is a no-rows case
      // unless the consumer also names the field after the source key.
      { record: { lines: [{ label: 'A' }], nested: [{ label: 'X' }] } },
    )
    const m = out[0] as ElementMeta & {
      rows: Array<{ children: ElementMeta[] }>
      value?: unknown
    }
    // Rows still resolve from `record.lines` (RepeatableEntry's row source
    // is name-bound — `state()` doesn't redirect the row read).
    assert.equal(m.rows.length, 1)
    assert.equal((m.rows[0]!.children[0] as ElementMeta)['value'], 'A')
    // But the `value` field reflects the state() override.
    assert.deepEqual(m.value, [{ label: 'X' }])
  })

  it('empty inner schema short-circuits to empty rows', async () => {
    const out = await resolveSchema(
      [RepeatableEntry.make('items')],
      { record: { items: [{ label: 'A' }] } },
    )
    const m = out[0] as ElementMeta & { rows: unknown[] }
    assert.deepEqual(m.rows, [])
  })
})
