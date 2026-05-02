import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RepeaterField, Repeater, isRepeaterField, type RepeaterFieldMeta } from './RepeaterField.js'
import { TextField } from './TextField.js'
import { NumberField } from './NumberField.js'
import { ToggleField } from './ToggleField.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { coerceFormValues, applyStateUpdate, findForms } from '../elements/dispatchForm.js'
import { findActions } from '../elements/dispatchAction.js'
import { Form } from '../elements/Form.js'
import { Section } from '../schema/Section.js'
import { Action } from '../actions/Action.js'
import { validateSchema, isValid } from '../validation/index.js'

describe('RepeaterField', () => {
  it('emits fieldType "repeater"', () => {
    const meta = RepeaterField.make('items').toMeta()
    assert.equal(meta.fieldType, 'repeater')
  })

  it('exports an alias `Repeater`', () => {
    assert.equal(Repeater, RepeaterField)
  })

  it('uses `field` as the element type discriminator', () => {
    const f = RepeaterField.make('items')
    assert.equal(f.getType(), 'field')
  })

  it('label defaults to titlecased name', () => {
    const meta = RepeaterField.make('lineItems').toMeta()
    assert.equal(meta.label, 'LineItems')
  })

  it('defaultItems defaults to 1', () => {
    const meta = RepeaterField.make('items').toMeta()
    assert.equal(meta.defaultItems, 1)
    assert.equal(RepeaterField.make('items').getDefaultItems(), 1)
  })

  it('rows and template default to empty arrays', () => {
    const meta = RepeaterField.make('items').toMeta()
    assert.deepEqual(meta.rows, [])
    assert.deepEqual(meta.template, [])
  })

  describe('builders', () => {
    it('schema() stores inner elements', () => {
      const inner = [
        TextField.make('product'),
        NumberField.make('quantity'),
      ]
      const f = RepeaterField.make('items').schema(inner)
      assert.deepEqual(f.getInnerSchema(), inner)
      assert.deepEqual(f.getChildren(), inner)
    })

    it('getChildren() returns undefined when no inner schema', () => {
      const f = RepeaterField.make('items')
      assert.equal(f.getChildren(), undefined)
    })

    it('columns() sets meta.columns', () => {
      assert.equal('columns' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').columns(2).toMeta().columns, 2)
    })

    it('defaultItems() sets meta.defaultItems', () => {
      const meta = RepeaterField.make('x').defaultItems(3).toMeta()
      assert.equal(meta.defaultItems, 3)
    })

    it('minItems() sets meta.minItems', () => {
      assert.equal('minItems' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').minItems(1).toMeta().minItems, 1)
    })

    it('maxItems() sets meta.maxItems', () => {
      assert.equal('maxItems' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').maxItems(50).toMeta().maxItems, 50)
    })

    it('reorderable() emits only when set', () => {
      assert.equal('reorderable' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').reorderable().toMeta().reorderable, true)
    })

    it('collapsible() emits only when set', () => {
      assert.equal('collapsible' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').collapsible().toMeta().collapsible, true)
    })

    it('collapsed() emits defaultCollapsed only when set', () => {
      assert.equal('defaultCollapsed' in RepeaterField.make('x').toMeta(), false)
      assert.equal(
        RepeaterField.make('x').collapsible().collapsed().toMeta().defaultCollapsed,
        true,
      )
    })

    it('accordion() emits only when set', () => {
      assert.equal('accordion' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').accordion().toMeta().accordion, true)
    })

    it('accordion() auto-arms collapsible()', () => {
      const meta = RepeaterField.make('x').accordion().toMeta()
      assert.equal(meta.collapsible, true)
      assert.equal(meta.accordion,   true)
      assert.equal(RepeaterField.make('x').accordion().isCollapsible(), true)
    })

    it('accordion(false) leaves collapsible alone', () => {
      // Explicit opt-out shouldn't drag collapsible along — and shouldn't
      // turn off a separately-armed collapsible() either.
      const meta = RepeaterField.make('x').collapsible().accordion(false).toMeta()
      assert.equal(meta.collapsible, true)
      assert.equal('accordion' in meta, false)
    })

    it('accordion() composes with collapsed() to start all-collapsed', () => {
      // Pairs cleanly with collapsed() — accordion default is "first row
      // open"; collapsed() flips it to "all collapsed". The renderer is
      // the one that consults defaultCollapsed; the field just exposes
      // both flags.
      const meta = RepeaterField.make('x').accordion().collapsed().toMeta()
      assert.equal(meta.accordion,        true)
      assert.equal(meta.collapsible,      true)
      assert.equal(meta.defaultCollapsed, true)
    })

    it('isAccordion() reflects setter', () => {
      assert.equal(RepeaterField.make('x').isAccordion(), false)
      assert.equal(RepeaterField.make('x').accordion().isAccordion(), true)
      assert.equal(RepeaterField.make('x').accordion(false).isAccordion(), false)
    })

    it('cloneable() emits only when set', () => {
      assert.equal('cloneable' in RepeaterField.make('x').toMeta(), false)
      assert.equal(RepeaterField.make('x').cloneable().toMeta().cloneable, true)
    })

    it('grid() emits only when set with n >= 2', () => {
      // Default — no key on meta.
      assert.equal('grid' in RepeaterField.make('x').toMeta(), false)
      // n >= 2 lands on meta.
      assert.equal(RepeaterField.make('x').grid(3).toMeta().grid, 3)
      // n < 2 resets to undefined (so passing 1 is the documented "off"
      // form, mirroring how columns(1) is the no-grid sentinel).
      assert.equal('grid' in RepeaterField.make('x').grid(1).toMeta(),  false)
      assert.equal('grid' in RepeaterField.make('x').grid(0).toMeta(),  false)
      // Re-arming after a reset works.
      assert.equal(
        RepeaterField.make('x').grid(0).grid(2).toMeta().grid,
        2,
      )
    })

    it('getGrid() reflects the setter', () => {
      assert.equal(RepeaterField.make('x').getGrid(), undefined)
      assert.equal(RepeaterField.make('x').grid(2).getGrid(), 2)
      assert.equal(RepeaterField.make('x').grid(2).grid(1).getGrid(), undefined)
    })

    it('grid() composes with reorderable / collapsible / accordion', () => {
      // The renderer suppresses the drop indicator in grid mode but
      // keeps button reorder + accordion behavior. Field-level should
      // not gate on those flags — they're orthogonal.
      const meta = RepeaterField.make('x')
        .grid(2)
        .reorderable()
        .accordion()
        .toMeta()
      assert.equal(meta.grid,        2)
      assert.equal(meta.reorderable, true)
      assert.equal(meta.accordion,   true)
      assert.equal(meta.collapsible, true)
    })

    it('table() emits column descriptors only when a non-empty array is set', () => {
      // Default — no key on meta.
      assert.equal('table' in RepeaterField.make('x').toMeta(), false)
      // Empty array is the off sentinel.
      assert.equal('table' in RepeaterField.make('x').table([]).toMeta(), false)
      // Non-empty lands the column array verbatim.
      const meta = RepeaterField.make('x').table([
        { label: 'Name' },
        { label: 'Role', alignment: 'right', width: '30%', required: true },
      ]).toMeta()
      assert.deepEqual(meta.table, {
        columns: [
          { label: 'Name' },
          { label: 'Role', alignment: 'right', width: '30%', required: true },
        ],
      })
    })

    it('table() with an empty array clears a previously-set column array', () => {
      // Lets users toggle table mode on/off via a config value without
      // a separate "untable()" branch — mirrors grid()'s sentinel form.
      const meta = RepeaterField.make('x')
        .table([{ label: 'Name' }])
        .table([])
        .toMeta()
      assert.equal('table' in meta, false)
    })

    it('isTable() / getTableColumns() reflect the setter', () => {
      const f = RepeaterField.make('x')
      assert.equal(f.isTable(),         false)
      assert.equal(f.getTableColumns(), undefined)
      const t = f.table([{ label: 'Name' }])
      assert.equal(t.isTable(),         true)
      assert.deepEqual(t.getTableColumns(), [{ label: 'Name' }])
      // Round-trip through the empty-array off sentinel.
      const off = t.table([])
      assert.equal(off.isTable(),         false)
      assert.equal(off.getTableColumns(), undefined)
    })

    it('addActionLabel() emits only when set', () => {
      assert.equal('addActionLabel' in RepeaterField.make('x').toMeta(), false)
      assert.equal(
        RepeaterField.make('x').addActionLabel('Add line').toMeta().addActionLabel,
        'Add line',
      )
    })

    it('itemLabel() stores the function (not on meta — evaluated per row in step 2)', () => {
      const fn = (row: Record<string, unknown>) => String(row['title'] ?? '')
      const f = RepeaterField.make('x').itemLabel(fn)
      assert.equal(f.getItemLabel(), fn)
    })

    it('chained builders compose', () => {
      const meta = RepeaterField.make('items')
        .label('Line items')
        .schema([TextField.make('product'), NumberField.make('qty'), ToggleField.make('on')])
        .columns(2)
        .defaultItems(2)
        .minItems(1)
        .maxItems(20)
        .reorderable()
        .collapsible()
        .collapsed()
        .cloneable()
        .addActionLabel('Add item')
        .toMeta()

      assert.equal(meta.label,            'Line items')
      assert.equal(meta.columns,          2)
      assert.equal(meta.defaultItems,     2)
      assert.equal(meta.minItems,         1)
      assert.equal(meta.maxItems,         20)
      assert.equal(meta.reorderable,      true)
      assert.equal(meta.collapsible,      true)
      assert.equal(meta.defaultCollapsed, true)
      assert.equal(meta.cloneable,        true)
      assert.equal(meta.addActionLabel,   'Add item')
    })
  })

  describe('per-row resolve (Step 2)', () => {
    function repeater() {
      return RepeaterField.make('items')
        .schema([
          TextField.make('product'),
          NumberField.make('quantity'),
        ])
    }

    function metaOf(m: unknown): RepeaterFieldMeta {
      return m as RepeaterFieldMeta
    }

    it('zero submitted rows + defaultItems(0) → empty rows array', async () => {
      const [raw] = await resolveSchema([repeater().defaultItems(0)])
      const m = metaOf(raw)
      assert.deepEqual(m.rows, [])
      // Template still resolves so the Add button has a blueprint
      assert.equal(m.template.length, 2)
    })

    it('no submitted values → defaultItems empty rows', async () => {
      const [raw] = await resolveSchema([repeater().defaultItems(2)])
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
      assert.equal(m.rows[0]?.id, 'items-0')
      assert.equal(m.rows[1]?.id, 'items-1')
      assert.equal(m.rows[0]?.children.length, 2)
    })

    it('submitted N rows → N resolved rows', async () => {
      const [raw] = await resolveSchema(
        [repeater()],
        { values: { items: [{ product: 'Widget', quantity: 2 }, { product: 'Gear', quantity: 5 }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
      assert.equal(m.rows[0]?.id, 'items-0')
      assert.equal(m.rows[1]?.id, 'items-1')
    })

    it('preserves __id from submitted row values', async () => {
      const [raw] = await resolveSchema(
        [repeater()],
        { values: { items: [{ __id: 'row-abc', product: 'X' }, { __id: 'row-def', product: 'Y' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.id, 'row-abc')
      assert.equal(m.rows[1]?.id, 'row-def')
    })

    it('falls back to deterministic id when __id is non-string or missing', async () => {
      const [raw] = await resolveSchema(
        [repeater()],
        { values: { items: [{ __id: 42 }, { __id: '' }, {}] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.id, 'items-0')
      assert.equal(m.rows[1]?.id, 'items-1')
      assert.equal(m.rows[2]?.id, 'items-2')
    })

    it('row-scoped $get reads only the row\'s values (not parent)', async () => {
      // Gate capture on `ctx.row` — the template resolve fires the same
      // callback with empty values, and we only want the row pass.
      let captured: unknown
      const f = RepeaterField.make('items').schema([
        TextField.make('product').showWhen(({ $get, row }) => {
          if (row) captured = $get?.('product')
          return true
        }),
      ])
      await resolveSchema(
        [f],
        { values: { items: [{ product: 'rowOne' }], product: 'parentLevel' } },
      )
      assert.equal(captured, 'rowOne')
    })

    it('row-scoped row.$get sugar matches values $get', async () => {
      let viaRow: unknown
      let viaValues: unknown
      const f = RepeaterField.make('items').schema([
        TextField.make('product').showWhen((ctx) => {
          if (ctx.row) {
            viaRow    = ctx.row.$get('product')
            viaValues = ctx.$get?.('product')
          }
          return true
        }),
      ])
      await resolveSchema(
        [f],
        { values: { items: [{ product: 'fromRow' }] } },
      )
      assert.equal(viaRow, 'fromRow')
      assert.equal(viaValues, 'fromRow')
    })

    it('row index is exposed via ctx.row.index', async () => {
      const seen: number[] = []
      const f = RepeaterField.make('items').schema([
        TextField.make('product').showWhen((ctx) => {
          if (ctx.row) seen.push(ctx.row.index)
          return true
        }),
      ])
      await resolveSchema(
        [f],
        { values: { items: [{}, {}, {}] } },
      )
      assert.deepEqual(seen, [0, 1, 2])
    })

    it('itemLabel() runs once per row and lands on RepeaterRowMeta.itemLabel', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .itemLabel(row => String(row['product'] ?? 'Untitled'))
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ product: 'Widget' }, { product: 'Gear' }, {}] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.itemLabel, 'Widget')
      assert.equal(m.rows[1]?.itemLabel, 'Gear')
      assert.equal(m.rows[2]?.itemLabel, 'Untitled')
    })

    it('itemLabel() throwing is swallowed (row stays without label)', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .itemLabel(() => { throw new Error('boom') })
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ product: 'X' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.itemLabel, undefined)
    })

    it('template is resolved with empty values (no row scoping)', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product').default('seeded'),
      ])
      const [raw] = await resolveSchema([f])
      const m = metaOf(raw)
      const tpl = m.template[0] as { defaultValue?: unknown } | undefined
      assert.equal(tpl?.defaultValue, 'seeded')
    })

    it('does not attach `meta.children` (rows replace the generic recurse)', async () => {
      const f = RepeaterField.make('items').schema([TextField.make('product')])
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{}] } },
      )
      assert.equal('children' in (raw as Record<string, unknown>), false)
    })

    it('non-array submitted values fall back to defaultItems empty rows', async () => {
      const f = RepeaterField.make('items').schema([TextField.make('product')]).defaultItems(2)
      const [raw] = await resolveSchema(
        [f],
        { values: { items: 'not-an-array' as unknown } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
    })

    it('non-object row entries are coerced to {}', async () => {
      const f = RepeaterField.make('items').schema([TextField.make('product')])
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [null, 42, 'string', { product: 'real' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows.length, 4)
    })
  })

  describe('itemHidden (v1.2 row-level visibility)', () => {
    function repeater() {
      return RepeaterField.make('items').schema([
        TextField.make('product'),
        ToggleField.make('archived'),
      ])
    }

    function metaOf(m: unknown): RepeaterFieldMeta {
      return m as RepeaterFieldMeta
    }

    it('builder stores rule + accessor returns it', () => {
      const fn = (ctx: { values?: Record<string, unknown> }) => Boolean(ctx.values?.['archived'])
      const f  = RepeaterField.make('items').itemHidden(fn)
      assert.equal(f.getItemHidden(), fn)
    })

    it('rule unset → no row carries hidden flag', async () => {
      const [raw] = await resolveSchema(
        [repeater()],
        { values: { items: [{ product: 'A' }, { product: 'B' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, undefined)
      assert.equal(m.rows[1]?.hidden, undefined)
    })

    it('static `itemHidden(false)` → no row marked hidden', async () => {
      const [raw] = await resolveSchema(
        [repeater().itemHidden(false)],
        { values: { items: [{ product: 'A' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, undefined)
    })

    it('static `itemHidden(true)` → every row marked hidden', async () => {
      const [raw] = await resolveSchema(
        [repeater().itemHidden(true)],
        { values: { items: [{ product: 'A' }, { product: 'B' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, true)
      assert.equal(m.rows[1]?.hidden, true)
    })

    it('predicate sees row-scoped values + can hide selectively', async () => {
      const f = repeater().itemHidden(({ values }) => Boolean(values?.['archived']))
      const [raw] = await resolveSchema(
        [f],
        {
          values: {
            items: [
              { product: 'A', archived: false },
              { product: 'B', archived: true },
              { product: 'C', archived: false },
            ],
          },
        },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, undefined)
      assert.equal(m.rows[1]?.hidden, true)
      assert.equal(m.rows[2]?.hidden, undefined)
    })

    it('predicate sees row.index', async () => {
      const seen: number[] = []
      const f = repeater().itemHidden(({ row }) => {
        if (row) seen.push(row.index)
        return false
      })
      await resolveSchema(
        [f],
        { values: { items: [{}, {}, {}] } },
      )
      assert.deepEqual(seen, [0, 1, 2])
    })

    it('async predicate is awaited', async () => {
      const f = repeater().itemHidden(async ({ values }) => {
        await Promise.resolve()
        return values?.['product'] === 'hide-me'
      })
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ product: 'keep' }, { product: 'hide-me' }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, undefined)
      assert.equal(m.rows[1]?.hidden, true)
    })

    it('throwing predicate → row stays visible (fail-closed-as-visible) + warns', async () => {
      const original = console.warn
      const warnings: unknown[][] = []
      console.warn = (...args: unknown[]) => { warnings.push(args) }
      try {
        const f = repeater().itemHidden(() => { throw new Error('boom') })
        const [raw] = await resolveSchema(
          [f],
          { values: { items: [{ product: 'A' }] } },
        )
        const m = metaOf(raw)
        assert.equal(m.rows[0]?.hidden, undefined)
        assert.ok(warnings.length >= 1, 'expected at least one warning')
        assert.match(String(warnings[0]?.[0]), /itemHidden\(\) on Repeater "items" threw/)
      } finally {
        console.warn = original
      }
    })

    it('hidden rows still resolve their inner schema (so values round-trip on submit)', async () => {
      const f = repeater().itemHidden(({ values }) => Boolean(values?.['archived']))
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ product: 'A', archived: true }] } },
      )
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, true)
      // Inner schema is still resolved so the renderer can mount inputs
      // for FormData round-trip.
      assert.equal(m.rows[0]?.children.length, 2)
    })
  })

  describe('coerceFormValues (Step 3)', () => {
    function repeater() {
      return RepeaterField.make('items').schema([
        TextField.make('product'),
        NumberField.make('quantity'),
        ToggleField.make('featured'),
      ])
    }

    it('JSON-shape body — passes array through with per-row coercion', () => {
      const out = coerceFormValues(
        [repeater()],
        { items: [
          { product: 'Widget', quantity: '2', featured: 'true' },
          { product: 'Gear',   quantity: '5', featured: '' },
        ] },
      )
      assert.deepEqual(out['items'], [
        { product: 'Widget', quantity: 2, featured: true },
        { product: 'Gear',   quantity: 5, featured: false },
      ])
    })

    it('flat-shape body — groups by index and recurses', () => {
      const out = coerceFormValues(
        [repeater()],
        {
          'items.0.product':  'Widget',
          'items.0.quantity': '2',
          'items.0.featured': 'true',
          'items.1.product':  'Gear',
          'items.1.quantity': '5',
        },
      )
      assert.deepEqual(out['items'], [
        { product: 'Widget', quantity: 2, featured: true },
        { product: 'Gear',   quantity: 5, featured: false },
      ])
    })

    it('flat-shape body — strips flat keys from output', () => {
      const out = coerceFormValues(
        [repeater()],
        { 'items.0.product': 'Widget', 'items.0.quantity': '2' },
      )
      assert.equal('items.0.product'  in out, false)
      assert.equal('items.0.quantity' in out, false)
    })

    it('flat-shape body — fills index gaps with empty rows', () => {
      const out = coerceFormValues(
        [repeater()],
        { 'items.0.product': 'A', 'items.2.product': 'C' },
      )
      const items = out['items'] as Array<Record<string, unknown>>
      assert.equal(items.length, 3)
      assert.equal(items[0]?.['product'], 'A')
      assert.equal(items[1]?.['product'], undefined)
      assert.equal(items[2]?.['product'], 'C')
    })

    it('preserves __id round-tripped from previous render', () => {
      const out = coerceFormValues(
        [repeater()],
        { items: [{ __id: 'row-abc', product: 'Widget', quantity: '1' }] },
      )
      const items = out['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['__id'], 'row-abc')
      assert.equal(items[0]?.['product'], 'Widget')
    })

    it('trims trailing untouched rows (no entered values)', () => {
      const out = coerceFormValues(
        [repeater()],
        { items: [{ product: 'Widget' }, {}, { __id: 'x' }] },
      )
      assert.equal((out['items'] as unknown[]).length, 1)
    })

    it('keeps a row with `0` or `false` even if nothing else is set', () => {
      // 0 and false are real values; only undefined/null/'' count as untouched.
      const out = coerceFormValues(
        [repeater()],
        { items: [{ quantity: '0' }, { featured: 'false' }] },
      )
      assert.equal((out['items'] as unknown[]).length, 2)
    })

    it('preserves middle gaps (only trailing rows are trimmed)', () => {
      const out = coerceFormValues(
        [repeater()],
        { items: [{ product: 'A' }, {}, { product: 'C' }] },
      )
      assert.equal((out['items'] as unknown[]).length, 3)
    })

    it('non-array JSON body coerces to empty array', () => {
      const out = coerceFormValues([repeater()], { items: 'not-an-array' })
      assert.deepEqual(out['items'], [])
    })

    it('missing body key → empty array', () => {
      const out = coerceFormValues([repeater()], {})
      assert.deepEqual(out['items'], [])
    })

    it('Repeater inside a Section is still picked up', () => {
      const out = coerceFormValues(
        [Section.make('Line items').schema([repeater()])],
        { items: [{ product: 'Widget', quantity: '3' }] },
      )
      // ToggleField('featured') coerces missing → false per standard rules; that's
      // the inner schema's job, not Repeater-specific.
      assert.deepEqual(out['items'], [{ product: 'Widget', quantity: 3, featured: false }])
    })

    it('does not coerce inner fields against the parent body', () => {
      // Parent body has `quantity: '999'` — should pass through to the parent
      // out untouched (no parent-level NumberField). Inner row gets its own
      // independent coercion: missing `quantity` → null per NumberField rules.
      const out = coerceFormValues(
        [TextField.make('parentField'), repeater()],
        { parentField: 'parent', quantity: '999', items: [{ product: 'X' }] },
      )
      assert.equal(out['parentField'], 'parent')
      assert.equal(out['quantity'], '999') // untouched — no parent-level field
      const items = out['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['quantity'], null) // inner field coerces undefined→null, NOT '999' from parent
    })

    it('nested Repeater — inner row coercion runs recursively', () => {
      const inner = RepeaterField.make('modifiers').schema([
        TextField.make('name'),
        NumberField.make('price'),
      ])
      const outer = RepeaterField.make('items').schema([
        TextField.make('product'),
        inner,
      ])
      const out = coerceFormValues(
        [outer],
        { items: [
          { product: 'Burger', modifiers: [{ name: 'Cheese', price: '1.50' }] },
        ] },
      )
      const items = out['items'] as Array<Record<string, unknown>>
      const modifiers = items[0]?.['modifiers'] as Array<Record<string, unknown>>
      assert.equal(modifiers[0]?.['name'], 'Cheese')
      assert.equal(modifiers[0]?.['price'], 1.5)
    })

    it('dehydrated(false) Repeater drops the value from the body', () => {
      const f = RepeaterField.make('scratch')
        .schema([TextField.make('note')])
        .dehydrated(false)
      const out = coerceFormValues(
        [f],
        { scratch: [{ note: 'temporary' }], real: 'value' },
      )
      assert.equal('scratch' in out, false)
      assert.equal(out['real'], 'value')
    })

    it('inner field with dehydrated(false) is dropped from each row', () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product'),
        TextField.make('helper').dehydrated(false),
      ])
      const out = coerceFormValues(
        [f],
        { items: [{ product: 'Widget', helper: 'should-be-stripped' }] },
      )
      const items = out['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['product'], 'Widget')
      assert.equal('helper' in (items[0] ?? {}), false)
    })
  })

  describe('validateSchema (Step 4)', () => {
    function repeater() {
      return RepeaterField.make('items').schema([
        TextField.make('product').required(),
        NumberField.make('quantity'),
      ])
    }

    it('valid rows produce no errors', async () => {
      const errors = await validateSchema(
        [repeater()],
        { items: [{ product: 'Widget', quantity: 1 }] },
      )
      assert.equal(isValid(errors), true)
    })

    it('inner field errors are flat-keyed by row index', async () => {
      const errors = await validateSchema(
        [repeater()],
        { items: [{ product: '' }, { product: 'OK' }, { product: '' }] },
      )
      assert.deepEqual(errors['items.0.product'], ['This field is required'])
      assert.equal('items.1.product' in errors, false)
      assert.deepEqual(errors['items.2.product'], ['This field is required'])
    })

    it('minItems violation lands on the bare repeater name', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .minItems(1)
      const errors = await validateSchema([f], { items: [] })
      assert.deepEqual(errors['items'], ['At least 1 item is required'])
    })

    it('minItems > 1 uses plural messaging', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .minItems(3)
      const errors = await validateSchema([f], { items: [{ product: 'A' }] })
      assert.deepEqual(errors['items'], ['At least 3 items are required'])
    })

    it('maxItems violation lands on the bare repeater name', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .maxItems(2)
      const errors = await validateSchema(
        [f],
        { items: [{ product: 'A' }, { product: 'B' }, { product: 'C' }] },
      )
      assert.deepEqual(errors['items'], ['At most 2 items are allowed'])
    })

    it('missing items field treated as empty array', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .minItems(1)
      const errors = await validateSchema([f], {})
      assert.deepEqual(errors['items'], ['At least 1 item is required'])
    })

    it('non-array items value treated as empty array', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product')])
        .minItems(1)
      const errors = await validateSchema([f], { items: 'not-an-array' })
      assert.deepEqual(errors['items'], ['At least 1 item is required'])
    })

    it('does not validate inner fields against the parent values', async () => {
      // Parent has `product` key, but the inner field shouldn't see it.
      const errors = await validateSchema(
        [TextField.make('product').required(), repeater()],
        { product: 'parent', items: [{ product: '' }] },
      )
      assert.equal(errors['product'], undefined) // parent passed (has value)
      assert.deepEqual(errors['items.0.product'], ['This field is required'])
    })

    it('nested Repeater — inner row errors flat-keyed through both levels', async () => {
      const inner = RepeaterField.make('modifiers').schema([
        TextField.make('name').required(),
      ])
      const outer = RepeaterField.make('items').schema([
        TextField.make('product'),
        inner,
      ])
      const errors = await validateSchema(
        [outer],
        { items: [
          { product: 'A', modifiers: [{ name: '' }, { name: 'Cheese' }] },
        ] },
      )
      assert.deepEqual(errors['items.0.modifiers.0.name'], ['This field is required'])
      assert.equal('items.0.modifiers.1.name' in errors, false)
    })

    it('combines bare-key min violation with per-row errors', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('product').required()])
        .minItems(2)
      const errors = await validateSchema([f], { items: [{ product: '' }] })
      assert.deepEqual(errors['items'], ['At least 2 items are required'])
      assert.deepEqual(errors['items.0.product'], ['This field is required'])
    })
  })

  describe('distinct() — cross-row uniqueness', () => {
    function distinctRepeater() {
      return RepeaterField.make('items').schema([
        TextField.make('product').distinct(),
        NumberField.make('quantity'),
      ])
    }

    it('all-unique rows produce no error', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: 'A' }, { product: 'B' }, { product: 'C' }],
      })
      assert.equal(isValid(errors), true)
    })

    it('duplicate value flags every row beyond the first occurrence', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: 'A' }, { product: 'A' }, { product: 'A' }],
      })
      assert.equal('items.0.product' in errors, false)
      assert.deepEqual(errors['items.1.product'], ['Must be unique'])
      assert.deepEqual(errors['items.2.product'], ['Must be unique'])
    })

    it('first occurrence is always allowed (even at the last row)', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: 'A' }, { product: 'B' }, { product: 'A' }],
      })
      assert.equal('items.0.product' in errors, false)
      assert.equal('items.1.product' in errors, false)
      assert.deepEqual(errors['items.2.product'], ['Must be unique'])
    })

    it('default ignoreNulls=true skips empty / null / undefined values', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: '' }, { product: '' }, { product: null }, {}],
      })
      assert.equal(isValid(errors), true)
    })

    it('ignoreNulls=false flags duplicate empty rows too', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product').distinct({ ignoreNulls: false }),
      ])
      const errors = await validateSchema([f], {
        items: [{ product: '' }, { product: '' }],
      })
      assert.deepEqual(errors['items.1.product'], ['Must be unique'])
    })

    it('caseInsensitive folds case before comparing', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product').distinct({ caseInsensitive: true }),
      ])
      const errors = await validateSchema([f], {
        items: [{ product: 'Foo' }, { product: 'foo' }, { product: 'FOO' }],
      })
      assert.equal('items.0.product' in errors, false)
      assert.deepEqual(errors['items.1.product'], ['Must be unique'])
      assert.deepEqual(errors['items.2.product'], ['Must be unique'])
    })

    it('caseInsensitive=false (default) treats different cases as distinct', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: 'Foo' }, { product: 'foo' }],
      })
      assert.equal(isValid(errors), true)
    })

    it('custom message overrides the default', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product').distinct({ message: 'Each product must appear once' }),
      ])
      const errors = await validateSchema([f], {
        items: [{ product: 'A' }, { product: 'A' }],
      })
      assert.deepEqual(errors['items.1.product'], ['Each product must appear once'])
    })

    it('runs alongside per-field validators (does not replace them)', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product').required().distinct(),
      ])
      const errors = await validateSchema([f], {
        items: [{ product: 'A' }, { product: '' }, { product: 'A' }],
      })
      // Row 1 fails required (empty); row 2 fails distinct (duplicate of row 0).
      assert.deepEqual(errors['items.1.product'], ['This field is required'])
      assert.deepEqual(errors['items.2.product'], ['Must be unique'])
    })

    it('multiple distinct fields are independent', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('sku').distinct(),
        TextField.make('label').distinct(),
      ])
      const errors = await validateSchema([f], {
        items: [
          { sku: 'X', label: 'red' },
          { sku: 'X', label: 'blue' },   // dup sku, unique label
          { sku: 'Y', label: 'red' },    // unique sku, dup label
        ],
      })
      assert.deepEqual(errors['items.1.sku'],   ['Must be unique'])
      assert.deepEqual(errors['items.2.label'], ['Must be unique'])
      assert.equal('items.1.label' in errors, false)
      assert.equal('items.2.sku'   in errors, false)
    })

    it('distinct() is a no-op outside an array-row context (no top-level cross-form check)', async () => {
      // A distinct flag on a regular form Field never fires through validateSchema —
      // there's nothing to compare against. This locks in the no-op posture so a
      // future refactor can't accidentally widen distinct() to a single-row context.
      const errors = await validateSchema(
        [TextField.make('product').distinct()],
        { product: 'A' },
      )
      assert.equal(isValid(errors), true)
    })

    it('distinct(false) clears a previously-set rule', async () => {
      const field = TextField.make('product').distinct({ caseInsensitive: true }).distinct(false)
      const f = RepeaterField.make('items').schema([field])
      const errors = await validateSchema([f], {
        items: [{ product: 'A' }, { product: 'A' }],
      })
      assert.equal(isValid(errors), true)
    })

    it('compares values across non-trailing rows when later rows are empty', async () => {
      const errors = await validateSchema([distinctRepeater()], {
        items: [{ product: 'A' }, { product: 'A' }, {}],
      })
      assert.deepEqual(errors['items.1.product'], ['Must be unique'])
    })
  })

  describe('applyStateUpdate (Step 5 — reactive interop)', () => {
    function buildForm(repeater: RepeaterField): Form {
      return Form.make().schema([repeater])
    }

    it('routes a top-level (no-dot) name through the existing path', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([TextField.make('product')]),
      )
      // Bare 'items' — coerces against the Repeater itself (whole-array path)
      const result = await applyStateUpdate(f, { items: [{ product: 'X' }] }, 'items')
      assert.notEqual(result, null)
      assert.deepEqual(result?.dirty, ['items'])
    })

    it('returns null (404) when dotted path doesn\'t resolve', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([TextField.make('product')]),
      )
      const result = await applyStateUpdate(f, { items: [{}] }, 'items.0.unknown')
      assert.equal(result, null)
    })

    it('returns null when row index isn\'t a valid integer', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([TextField.make('product')]),
      )
      const result = await applyStateUpdate(f, { items: [{}] }, 'items.notanumber.product')
      assert.equal(result, null)
    })

    it('returns null when path resolves to non-Repeater field followed by index', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([TextField.make('product')]),
      )
      // 'items.0.product.0' — product is a TextField, not a Repeater, so
      // 'product.0' is invalid.
      const result = await applyStateUpdate(f, { items: [{ product: 'X' }] }, 'items.0.product.0')
      assert.equal(result, null)
    })

    it('coerces only the leaf field on the right row', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product'),
          NumberField.make('quantity'),
        ]),
      )
      const result = await applyStateUpdate(
        f,
        { items: [{ product: 'A', quantity: '1' }, { product: 'B', quantity: '5' }] },
        'items.1.quantity',
      )
      const items = result?.values['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['quantity'], '1')      // row 0 untouched (still raw string)
      assert.equal(items[1]?.['quantity'], 5)        // row 1 coerced to number
      assert.equal(items[0]?.['product'], 'A')       // siblings untouched
      assert.deepEqual(result?.dirty, ['items.1.quantity'])
    })

    it('row-scoped $get reads only the row\'s siblings', async () => {
      let captured: unknown
      const f = buildForm(
        RepeaterField.make('items').schema([
          NumberField.make('quantity').live().afterStateUpdated((_v, { $get }) => {
            captured = $get('product')
          }),
          TextField.make('product'),
        ]),
      )
      await applyStateUpdate(
        f,
        { items: [{ product: 'rowZero', quantity: '0' }, { product: 'rowOne', quantity: '99' }] },
        'items.1.quantity',
      )
      assert.equal(captured, 'rowOne') // row 1's product, not row 0
    })

    it('row-scoped $set writes to the same row and tracks dirty in dotted form', async () => {
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product').live().afterStateUpdated((_v, { $set }) => {
            $set('slug', 'derived')
          }),
          TextField.make('slug'),
        ]),
      )
      const result = await applyStateUpdate(
        f,
        { items: [{ product: 'first' }, { product: 'second' }] },
        'items.1.product',
      )
      const items = result?.values['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['slug'], undefined)    // row 0 untouched
      assert.equal(items[1]?.['slug'], 'derived')    // row 1 mutated
      assert.ok(result?.dirty.includes('items.1.product'))
      assert.ok(result?.dirty.includes('items.1.slug'))
    })

    it('dotted-path $get/$set reaches into other rows', async () => {
      const seen: unknown[] = []
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product').live().afterStateUpdated((_v, { $get, $set }) => {
            seen.push($get('items.0.product'))
            $set('items.0.notes', 'cross-row')
          }),
        ]),
      )
      const result = await applyStateUpdate(
        f,
        { items: [{ product: 'A' }, { product: 'B' }] },
        'items.1.product',
      )
      assert.deepEqual(seen, ['A'])
      const items = result?.values['items'] as Array<Record<string, unknown>>
      assert.equal(items[0]?.['notes'], 'cross-row')
      assert.ok(result?.dirty.includes('items.0.notes'))
    })

    it('exposes ctx.row.index + row.$get / row.$set sugar', async () => {
      let seenIdx: number | undefined
      let seenSibling: unknown
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product').live().afterStateUpdated((_v, { row }) => {
            seenIdx     = row?.index
            seenSibling = row?.$get('product')
          }),
        ]),
      )
      await applyStateUpdate(
        f,
        { items: [{}, {}, { product: 'thirdRow' }] },
        'items.2.product',
      )
      assert.equal(seenIdx, 2)
      assert.equal(seenSibling, 'thirdRow')
    })

    it('does not mutate the input values map', async () => {
      const input = { items: [{ product: 'A', quantity: '1' }] }
      const inputBefore = JSON.parse(JSON.stringify(input))
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product'),
          NumberField.make('quantity'),
        ]),
      )
      await applyStateUpdate(f, input, 'items.0.quantity')
      assert.deepEqual(input, inputBefore)
    })

    it('handles nested Repeaters', async () => {
      const inner = RepeaterField.make('modifiers').schema([
        TextField.make('name').live().afterStateUpdated((_v, { $get, row }) => {
          // row-scoped $get reads the modifier row's siblings
          ;(globalThis as Record<string, unknown>)['__nested_seen'] = {
            sibling: $get('name'),
            index:   row?.index,
          }
        }),
      ])
      const f = buildForm(
        RepeaterField.make('items').schema([
          TextField.make('product'),
          inner,
        ]),
      )
      await applyStateUpdate(
        f,
        { items: [
          { product: 'A', modifiers: [{ name: 'Cheese' }, { name: 'Bacon' }] },
        ] },
        'items.0.modifiers.1.name',
      )
      const seen = (globalThis as Record<string, unknown>)['__nested_seen'] as {
        sibling: unknown
        index:   number
      }
      assert.equal(seen.sibling, 'Bacon')
      assert.equal(seen.index, 1)
      delete (globalThis as Record<string, unknown>)['__nested_seen']
    })

    it('creates the row map when submitted values is missing the row', async () => {
      // The client posts with `values.items` defined but the row at the
      // changed index is missing — ensure the resolver fills it.
      const f = buildForm(
        RepeaterField.make('items').schema([TextField.make('product')]),
      )
      const result = await applyStateUpdate(f, { items: [] }, 'items.0.product')
      assert.notEqual(result, null)
      const items = result?.values['items'] as Array<Record<string, unknown>>
      assert.equal(items.length, 1)
    })
  })

  describe('layout visibility interop (Step 6)', () => {
    function metaOf(m: unknown): RepeaterFieldMeta {
      return m as RepeaterFieldMeta
    }

    it('inner Section.visible sees row-scoped values', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('kind'),
        Section.make('Advanced')
          .schema([TextField.make('detail')])
          .visible(({ values }) => values?.['kind'] === 'advanced'),
      ])
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ kind: 'simple' }, { kind: 'advanced' }] } },
      )
      const m = metaOf(raw)

      // Row 0: kind='simple' → Section hidden → only `kind` field rendered
      assert.equal(m.rows[0]?.children.length, 1)
      assert.equal((m.rows[0]?.children[0] as unknown as { name: string }).name, 'kind')

      // Row 1: kind='advanced' → Section rendered with its child
      assert.equal(m.rows[1]?.children.length, 2)
      const section = m.rows[1]?.children[1] as unknown as { type: string; children?: unknown[] }
      assert.equal(section.type, 'section')
      assert.equal(section.children?.length, 1)
    })

    it('inner Section.visible sees ctx.row.index when explicit row access is needed', async () => {
      const seenIndices: Array<number | undefined> = []
      const f = RepeaterField.make('items').schema([
        Section.make('Detail')
          .schema([TextField.make('x')])
          .visible((ctx) => {
            seenIndices.push(ctx.row?.index)
            return true
          }),
      ])
      await resolveSchema([f], { values: { items: [{}, {}, {}] } })
      // 3 rows + 1 template resolve (no row) — but template only runs visibility too?
      // Actually visibility runs during template too. Filter undefineds for the
      // template; the 3 row resolves should give us [0, 1, 2] in some order.
      const rowOnlyIndices = seenIndices.filter((i): i is number => i !== undefined).sort()
      assert.deepEqual(rowOnlyIndices, [0, 1, 2])
    })

    it('inner Section.visible(false) drops the section in every row', async () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('a'),
        Section.make('Hidden').schema([TextField.make('b')]).visible(false),
      ])
      const [raw] = await resolveSchema(
        [f],
        { values: { items: [{ a: 'x' }, { a: 'y' }] } },
      )
      const m = metaOf(raw)
      for (const row of m.rows) {
        assert.equal(row.children.length, 1)
        assert.equal((row.children[0] as unknown as { name: string }).name, 'a')
      }
    })

    it('throwing visibility rule in a row falls closed (section dropped)', async () => {
      const original = console.warn
      const warns: unknown[][] = []
      console.warn = (...args: unknown[]) => { warns.push(args) }
      try {
        const f = RepeaterField.make('items').schema([
          TextField.make('a'),
          Section.make('Wonky')
            .schema([TextField.make('b')])
            .visible(() => { throw new Error('boom') }),
        ])
        const [raw] = await resolveSchema(
          [f],
          { values: { items: [{}, {}] } },
        )
        const m = metaOf(raw)
        for (const row of m.rows) {
          assert.equal(row.children.length, 1)
        }
      } finally {
        console.warn = original
      }
    })
  })

  describe('walker registrations (Step 10)', () => {
    it('isRepeaterField uses structural type discrimination', () => {
      const r = RepeaterField.make('items')
      assert.equal(isRepeaterField(r), true)
      const t = TextField.make('product')
      assert.equal(isRepeaterField(t), false)
      const s = Section.make('S')
      assert.equal(isRepeaterField(s), false)
    })

    it('findForms does not dive into Repeater children', () => {
      const innerForm = Form.make().schema([TextField.make('x')])
      const outer = Form.make().schema([
        TextField.make('top'),
        RepeaterField.make('items').schema([
          TextField.make('product'),
          innerForm, // intentionally weird — should NOT be discovered
        ]),
      ])
      const found = findForms([outer])
      assert.equal(found.length, 1)
      assert.strictEqual(found[0], outer)
    })

    it('findActions does not dive into Repeater children', () => {
      const innerAction = Action.make('rowAction').handler(() => undefined)
      const outerAction = Action.make('headerAction').handler(() => undefined)
      const form = Form.make().schema([
        outerAction,
        RepeaterField.make('items').schema([
          TextField.make('product'),
          innerAction, // intentionally weird — should NOT be discovered
        ]),
      ])
      const found = findActions([form])
      assert.equal(found.length, 1)
      assert.strictEqual(found[0], outerAction)
    })
  })

  describe('inheritance from Field', () => {
    it('inherits required()', () => {
      const meta = RepeaterField.make('items').required().toMeta()
      assert.equal(meta.required, true)
    })

    it('inherits helperText()', () => {
      const meta = RepeaterField.make('items').helperText('At least one row').toMeta()
      assert.equal(meta.helperText, 'At least one row')
    })

    it('inherits label() override', () => {
      const meta = RepeaterField.make('items').label('Custom label').toMeta()
      assert.equal(meta.label, 'Custom label')
    })

    it('inherits live() reactive flag', () => {
      const meta = RepeaterField.make('items').live().toMeta()
      assert.equal(meta.live, true)
    })
  })

  describe('extraItemActions (per-row buttons)', () => {
    it('builder stores extra actions; getter returns them', () => {
      const a = Action.make('promote').handler(() => undefined)
      const b = Action.make('archive').handler(() => undefined)
      const f = RepeaterField.make('items').extraItemActions([a, b])
      assert.deepEqual(f.getExtraItemActions(), [a, b])
    })

    it('getter defaults to empty array', () => {
      assert.deepEqual(RepeaterField.make('items').getExtraItemActions(), [])
    })

    it('per-row resolve stamps extraActions on each row meta', async () => {
      const promote = Action.make('promote').handler(() => undefined)
      const f = RepeaterField.make('items')
        .schema([TextField.make('title')])
        .extraItemActions([promote])

      const [meta] = await resolveSchema([f], { values: { items: [{ title: 'a' }, { title: 'b' }] } })
      const repeater = meta as RepeaterFieldMeta
      assert.equal(repeater.rows.length, 2)
      assert.equal(repeater.rows[0]!.extraActions?.length, 1)
      assert.equal(repeater.rows[0]!.extraActions?.[0]?.name, 'promote')
      assert.equal(repeater.rows[1]!.extraActions?.length, 1)
    })

    it('absent when no extra actions registered', async () => {
      const f = RepeaterField.make('items')
        .schema([TextField.make('title')])
      const [meta] = await resolveSchema([f], { values: { items: [{ title: 'a' }] } })
      const repeater = meta as RepeaterFieldMeta
      assert.equal(repeater.rows[0]!.extraActions, undefined)
    })

    it('drops actions whose visible() rule resolves false for that row', async () => {
      const featured = Action.make('feature')
        .handler(() => undefined)
        .visible(({ values }) => values?.['status'] !== 'featured')
      const f = RepeaterField.make('items')
        .schema([TextField.make('title')])
        .extraItemActions([featured])

      const [meta] = await resolveSchema([f], { values: { items: [
        { title: 'a', status: 'draft'    },
        { title: 'b', status: 'featured' },
      ] } })
      const repeater = meta as RepeaterFieldMeta
      // Row 0 (draft) keeps the action; row 1 (featured) drops it.
      assert.equal(repeater.rows[0]!.extraActions?.length, 1)
      assert.equal(repeater.rows[1]!.extraActions, undefined)
    })

    it('stamps disabled: true when disabled() rule resolves true', async () => {
      const send = Action.make('sendTest')
        .handler(() => undefined)
        .disabled(({ values }) => !values?.['email'])
      const f = RepeaterField.make('subscribers')
        .schema([TextField.make('email')])
        .extraItemActions([send])

      const [meta] = await resolveSchema([f], { values: { subscribers: [
        { email: ''       },
        { email: 'x@y.io' },
      ] } })
      const repeater = meta as RepeaterFieldMeta
      assert.equal(repeater.rows[0]!.extraActions?.[0]?.disabled, true)
      assert.equal(repeater.rows[1]!.extraActions?.[0]?.disabled, undefined)
    })

    it('predicate sees parent record + user', async () => {
      let seenRecord: unknown
      let seenUser:   unknown
      const a = Action.make('a')
        .handler(() => undefined)
        .visible(({ record, user }) => {
          seenRecord = record
          seenUser   = user
          return true
        })
      const f = RepeaterField.make('items')
        .schema([TextField.make('title')])
        .extraItemActions([a])

      await resolveSchema([f], {
        values: { items: [{ title: 'x' }] },
        record: { id: 'parent-1' },
        user:   { name: 'admin' },
      })
      assert.deepEqual(seenRecord, { id: 'parent-1' })
      assert.deepEqual(seenUser,   { name: 'admin' })
    })
  })
})
