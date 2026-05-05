import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { BuilderField, Builder, isBuilderField, type BuilderFieldMeta } from './BuilderField.js'
import { RepeaterField } from './RepeaterField.js'
import { TextField } from './TextField.js'
import { NumberField } from './NumberField.js'
import { ToggleField } from './ToggleField.js'
import { Block } from '../schema/Block.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { coerceFormValues, applyStateUpdate, findForms } from '../elements/dispatchForm.js'
import { findActions } from '../elements/dispatchAction.js'
import { findTables } from '../elements/dispatchTable.js'
import { Form } from '../elements/Form.js'
import { Table } from '../elements/Table.js'
import { Action } from '../actions/Action.js'
import { Section } from '../schema/Section.js'
import { validateSchema, isValid } from '../validation/index.js'

// ─── Block ──────────────────────────────────────────────────

describe('Block', () => {
  it('label defaults to titlecased name', () => {
    const meta = Block.make('heading').toMeta()
    assert.equal(meta.label, 'Heading')
    assert.equal(meta.name, 'heading')
  })

  it('builders round-trip through toMeta', () => {
    const meta = Block.make('heading')
      .label('Title')
      .icon('heading')
      .columns(2)
      .maxItems(1)
      .toMeta()
    assert.equal(meta.label,    'Title')
    assert.equal(meta.icon,     'heading')
    assert.equal(meta.columns,  2)
    assert.equal(meta.maxItems, 1)
  })

  it('schema() stores inner elements', () => {
    const inner = [TextField.make('text'), NumberField.make('level')]
    const b = Block.make('heading').schema(inner)
    assert.deepEqual(b.getSchema(), inner)
  })

  it('only sets meta keys when configured', () => {
    const meta = Block.make('p').toMeta()
    assert.equal('icon'     in meta, false)
    assert.equal('columns'  in meta, false)
    assert.equal('maxItems' in meta, false)
  })

  describe('visible(rule)', () => {
    it('returns true when no rule is set', async () => {
      const visible = await Block.make('heading').evaluateVisibility()
      assert.equal(visible, true)
      assert.equal(Block.make('heading').hasVisibilityRule(), false)
    })

    it('boolean rule short-circuits', async () => {
      const b = Block.make('heading').visible(false)
      assert.equal(await b.evaluateVisibility(), false)
      assert.equal(b.hasVisibilityRule(), true)
    })

    it('callback receives the layout context', async () => {
      let seen: unknown
      const b = Block.make('heading').visible((ctx) => {
        seen = ctx.user
        return true
      })
      await b.evaluateVisibility({ user: { role: 'admin' } })
      assert.deepEqual(seen, { role: 'admin' })
    })

    it('async callback is awaited', async () => {
      const b = Block.make('heading').visible(async () => false)
      assert.equal(await b.evaluateVisibility(), false)
    })

    it('throwing rule fails closed (hidden)', async () => {
      const b = Block.make('heading').visible(() => { throw new Error('boom') })
      assert.equal(await b.evaluateVisibility(), false)
    })

    it('hidden() inverts the rule', async () => {
      assert.equal(await Block.make('h').hidden(true).evaluateVisibility(),  false)
      assert.equal(await Block.make('h').hidden(false).evaluateVisibility(), true)
      const b = Block.make('h').hidden((ctx) => ctx.user === 'banned')
      assert.equal(await b.evaluateVisibility({ user: 'banned' }), false)
      assert.equal(await b.evaluateVisibility({ user: 'ok' }),     true)
    })
  })
})

// ─── BuilderField ────────────────────────────────────────────

describe('BuilderField', () => {
  it('emits fieldType "builder"', () => {
    const meta = BuilderField.make('content').toMeta()
    assert.equal(meta.fieldType, 'builder')
  })

  it('exports an alias `Builder`', () => {
    assert.equal(Builder, BuilderField)
  })

  it('uses `field` as the element type discriminator', () => {
    assert.equal(BuilderField.make('content').getType(), 'field')
  })

  it('rows defaults to empty', () => {
    const meta = BuilderField.make('content').toMeta()
    assert.deepEqual(meta.rows, [])
    assert.deepEqual(meta.blocks, [])
  })

  it('blocks() ships picker meta (label/icon/columns/maxItems)', () => {
    const meta = BuilderField.make('content')
      .blocks([
        Block.make('heading').label('Heading').icon('heading').columns(2),
        Block.make('paragraph').label('Paragraph').maxItems(5),
      ])
      .toMeta()
    assert.equal(meta.blocks.length, 2)
    assert.equal(meta.blocks[0]?.name,    'heading')
    assert.equal(meta.blocks[0]?.label,   'Heading')
    assert.equal(meta.blocks[0]?.icon,    'heading')
    assert.equal(meta.blocks[0]?.columns, 2)
    assert.equal(meta.blocks[1]?.maxItems, 5)
  })

  describe('builders', () => {
    it('minItems() / maxItems() emit only when set', () => {
      const empty = BuilderField.make('x').toMeta()
      assert.equal('minItems' in empty, false)
      assert.equal('maxItems' in empty, false)

      const set = BuilderField.make('x').minItems(1).maxItems(10).toMeta()
      assert.equal(set.minItems, 1)
      assert.equal(set.maxItems, 10)
    })

    it('reorderable() / collapsible() / cloneable() / collapsed() / blockNumbers() / itemNumbers() / blockIcons(false) flip flags', () => {
      const meta = BuilderField.make('x')
        .reorderable()
        .reorderableWithButtons()
        .collapsible()
        .collapsed()
        .cloneable()
        .blockNumbers()
        .itemNumbers()
        .blockIcons(false)
        .toMeta()
      assert.equal(meta.reorderable,            true)
      assert.equal(meta.reorderableWithButtons, true)
      assert.equal(meta.collapsible,            true)
      assert.equal(meta.defaultCollapsed,       true)
      assert.equal(meta.cloneable,              true)
      assert.equal(meta.blockNumbers,           true)
      assert.equal(meta.itemNumbers,            true)
      assert.equal(meta.blockIcons,             false)
    })

    it('accordion() emits only when set, auto-arms collapsible', () => {
      assert.equal('accordion' in BuilderField.make('x').toMeta(), false)
      const meta = BuilderField.make('x').accordion().toMeta()
      assert.equal(meta.accordion,   true)
      assert.equal(meta.collapsible, true)
      assert.equal(BuilderField.make('x').accordion().isAccordion(),   true)
      assert.equal(BuilderField.make('x').accordion().isCollapsible(), true)
    })

    it('accordion() composes with collapsed() to start all-collapsed', () => {
      const meta = BuilderField.make('x').accordion().collapsed().toMeta()
      assert.equal(meta.accordion,        true)
      assert.equal(meta.collapsible,      true)
      assert.equal(meta.defaultCollapsed, true)
    })

    it('accordion(false) leaves collapsible alone and isAccordion() reflects setter', () => {
      const meta = BuilderField.make('x').collapsible().accordion(false).toMeta()
      assert.equal(meta.collapsible,         true)
      assert.equal('accordion' in meta,      false)
      assert.equal(BuilderField.make('x').isAccordion(), false)
      assert.equal(BuilderField.make('x').accordion().isAccordion(), true)
      assert.equal(BuilderField.make('x').accordion(false).isAccordion(), false)
    })

    it('addable(false) / deletable(false) emit only when off', () => {
      const on  = BuilderField.make('x').toMeta()
      assert.equal('addable'   in on, false)
      assert.equal('deletable' in on, false)
      const off = BuilderField.make('x').addable(false).deletable(false).toMeta()
      assert.equal(off.addable,   false)
      assert.equal(off.deletable, false)
    })

    it('addBetween() emits only when set', () => {
      const off = BuilderField.make('x').toMeta()
      assert.equal('addBetween' in off, false)
      assert.equal(BuilderField.make('x').isAddBetween(), false)
      const on  = BuilderField.make('x').addBetween().toMeta()
      assert.equal(on.addBetween, true)
      assert.equal(BuilderField.make('x').addBetween().isAddBetween(), true)
      // Toggleable back off.
      const back = BuilderField.make('x').addBetween().addBetween(false).toMeta()
      assert.equal('addBetween' in back, false)
    })

    it('addActionAlignment defaults to start (omitted) and emits when changed', () => {
      assert.equal('addActionAlignment' in BuilderField.make('x').toMeta(), false)
      const center = BuilderField.make('x').addActionAlignment('center').toMeta()
      assert.equal(center.addActionAlignment, 'center')
    })

    it('blockPickerColumns() emits only when set', () => {
      assert.equal('blockPickerColumns' in BuilderField.make('x').toMeta(), false)
      assert.equal(BuilderField.make('x').blockPickerColumns(2).toMeta().blockPickerColumns, 2)
    })

    it('addActionLabel() emits only when set', () => {
      assert.equal('addActionLabel' in BuilderField.make('x').toMeta(), false)
      assert.equal(
        BuilderField.make('x').addActionLabel('Add block').toMeta().addActionLabel,
        'Add block',
      )
    })

    it('itemHidden() / itemLabel() store the rule (evaluated per row at resolve)', () => {
      const labelFn  = (data: Record<string, unknown>) => String(data['text'] ?? '')
      const hiddenFn = () => false
      const f = BuilderField.make('x').itemLabel(labelFn).itemHidden(hiddenFn)
      assert.equal(f.getItemLabel(),  labelFn)
      assert.equal(f.getItemHidden(), hiddenFn)
    })

    it('grid() emits only when set with n >= 2', () => {
      // Mirrors RepeaterField.grid() — same semantics, same threshold.
      // n < 2 acts as the off sentinel so users can toggle via a config
      // value without a separate "no-grid" branch.
      assert.equal('grid' in BuilderField.make('x').toMeta(),       false)
      assert.equal(BuilderField.make('x').grid(2).toMeta().grid,    2)
      assert.equal('grid' in BuilderField.make('x').grid(1).toMeta(), false)
      assert.equal('grid' in BuilderField.make('x').grid(0).toMeta(), false)
      assert.equal(
        BuilderField.make('x').grid(0).grid(3).toMeta().grid,
        3,
      )
    })

    it('getGrid() reflects the setter', () => {
      assert.equal(BuilderField.make('x').getGrid(),               undefined)
      assert.equal(BuilderField.make('x').grid(2).getGrid(),       2)
      assert.equal(BuilderField.make('x').grid(2).grid(1).getGrid(), undefined)
    })

    it('grid() accepts a responsive object form (mirrors RepeaterField)', () => {
      const meta = BuilderField.make('x')
        .grid({ default: 1, md: 2, xl: 3 })
        .toMeta()
      assert.deepEqual(meta.grid, { default: 1, md: 2, xl: 3 })
    })

    it('grid() collapses single-default responsive object to scalar', () => {
      const meta = BuilderField.make('x').grid({ default: 3 }).toMeta()
      assert.equal(meta.grid, 3)
    })
  })

  // ─── Resolution ───────────────────────────────────────────

  describe('per-row resolve', () => {
    function builder() {
      return BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
        Block.make('paragraph').schema([TextField.make('body'), ToggleField.make('emphasized')]),
      ])
    }

    function metaOf(m: unknown): BuilderFieldMeta {
      return m as BuilderFieldMeta
    }

    it('zero submitted rows → empty rows array', async () => {
      const [raw] = await resolveSchema([builder()])
      const m = metaOf(raw)
      assert.deepEqual(m.rows, [])
      assert.equal(m.blocks.length, 2)
    })

    it('rows resolve against the matching block schema (heterogeneous)', async () => {
      const [raw] = await resolveSchema([builder()], {
        values: { content: [
          { type: 'heading',   data: { text: 'Welcome' } },
          { type: 'paragraph', data: { body: 'Hello',  emphasized: true } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
      assert.equal(m.rows[0]?.type, 'heading')
      assert.equal(m.rows[1]?.type, 'paragraph')
      assert.equal(m.rows[0]?.children.length, 1) // heading has 1 field
      assert.equal(m.rows[1]?.children.length, 2) // paragraph has 2 fields
    })

    it('preserves __id from submitted row values', async () => {
      const [raw] = await resolveSchema([builder()], {
        values: { content: [{ __id: 'row-abc', type: 'heading', data: { text: 'X' } }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.id, 'row-abc')
    })

    it('falls back to deterministic id when __id missing', async () => {
      const [raw] = await resolveSchema([builder()], {
        values: { content: [{ type: 'heading', data: {} }, { type: 'paragraph', data: {} }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.id, 'content-0')
      assert.equal(m.rows[1]?.id, 'content-1')
    })

    it('Block.visible() drops hidden blocks from picker meta only', async () => {
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
        Block.make('admin')
          .visible(({ user }) => (user as { role?: string } | undefined)?.role === 'admin')
          .schema([TextField.make('secret')]),
      ])
      const [rawGuest] = await resolveSchema([f], { user: { role: 'guest' } })
      const mGuest = metaOf(rawGuest)
      assert.equal(mGuest.blocks.length, 1)
      assert.equal(mGuest.blocks[0]?.name, 'heading')

      const [rawAdmin] = await resolveSchema([f], { user: { role: 'admin' } })
      const mAdmin = metaOf(rawAdmin)
      assert.equal(mAdmin.blocks.length, 2)
    })

    it('Block.visible() does NOT hide existing rows of a hidden block', async () => {
      // Toggling a feature flag must never silently destroy stored content.
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
        Block.make('admin').visible(false).schema([TextField.make('secret')]),
      ])
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading', data: { text: 'A' } },
          { type: 'admin',   data: { secret: 'shh' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.blocks.length, 1, 'picker drops admin')
      assert.equal(m.rows.length, 2, 'rows still render')
      assert.equal(m.rows[1]?.type, 'admin')
      assert.equal(m.rows[1]?.children.length, 1, 'admin row inner schema resolves')
    })

    it('unknown block type → unknownType:true with empty children', async () => {
      const [raw] = await resolveSchema([builder()], {
        values: { content: [{ type: 'mysterious', data: { stuff: 42 } }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.unknownType, true)
      assert.equal(m.rows[0]?.type, 'mysterious')
      assert.deepEqual(m.rows[0]?.children, [])
    })

    it('row-scoped $get reads the row\'s data only', async () => {
      let captured: unknown
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([
          TextField.make('text').showWhen(({ $get, row }) => {
            if (row) captured = $get?.('text')
            return true
          }),
        ]),
      ])
      await resolveSchema([f], {
        values: { content: [{ type: 'heading', data: { text: 'fromRow' } }] },
      })
      assert.equal(captured, 'fromRow')
    })

    it('ctx.row.index reflects the row position', async () => {
      const seen: number[] = []
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([
          TextField.make('text').showWhen(({ row }) => {
            if (row) seen.push(row.index)
            return true
          }),
        ]),
      ])
      await resolveSchema([f], {
        values: { content: [
          { type: 'heading', data: {} },
          { type: 'heading', data: {} },
          { type: 'heading', data: {} },
        ] },
      })
      assert.deepEqual(seen, [0, 1, 2])
    })

    it('itemLabel(data, blockName) lands on row.itemLabel', async () => {
      const f = BuilderField.make('content')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .itemLabel((data, blockName) => `${blockName}: ${String(data['text'] ?? '')}`)
      const [raw] = await resolveSchema([f], {
        values: { content: [{ type: 'heading', data: { text: 'Welcome' } }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.itemLabel, 'heading: Welcome')
    })

    it('itemHidden() truthy stamps row.hidden=true', async () => {
      const f = BuilderField.make('content')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .itemHidden(({ values }) => (values as Record<string, unknown>)['text'] === 'skip')
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading', data: { text: 'show' } },
          { type: 'heading', data: { text: 'skip' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.hidden, undefined)
      assert.equal(m.rows[1]?.hidden, true)
    })
  })

  describe('itemCanDelete / itemCanClone / itemCanReorder (per-row capability gates)', () => {
    function builder() {
      return BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
        Block.make('paragraph').schema([TextField.make('body')]),
      ])
    }

    function metaOf(m: unknown): BuilderFieldMeta {
      return m as BuilderFieldMeta
    }

    it('builders store + return their rules', () => {
      const del     = (_ctx: unknown) => true
      const clone   = (_ctx: unknown) => true
      const reorder = (_ctx: unknown) => true
      const f = BuilderField.make('content')
        .itemCanDelete(del as never)
        .itemCanClone(clone as never)
        .itemCanReorder(reorder as never)
      assert.equal(f.getItemCanDelete(),  del)
      assert.equal(f.getItemCanClone(),   clone)
      assert.equal(f.getItemCanReorder(), reorder)
    })

    it('rules unset → no row carries cap flags', async () => {
      const [raw] = await resolveSchema([builder()], {
        values: { content: [{ type: 'heading', data: { text: 'A' } }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canDelete,  undefined)
      assert.equal(m.rows[0]?.canClone,   undefined)
      assert.equal(m.rows[0]?.canReorder, undefined)
    })

    it('static `itemCanDelete(false)` → every row stamps canDelete: false', async () => {
      const f = builder().itemCanDelete(false)
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canDelete, false)
      assert.equal(m.rows[1]?.canDelete, false)
    })

    it('predicate sees row.blockType so a single rule can branch by block', async () => {
      const f = builder().itemCanDelete(({ row }) => row?.blockType !== 'heading')
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canDelete, false)
      assert.equal(m.rows[1]?.canDelete, undefined)
    })

    it('itemCanClone gates clone per-row', async () => {
      const f = builder()
        .cloneable()
        .itemCanClone(({ row }) => row?.index !== 0)
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canClone, false)
      assert.equal(m.rows[1]?.canClone, undefined)
    })

    it('itemCanReorder gates reorder controls per-row', async () => {
      const f = builder()
        .reorderable()
        .itemCanReorder(({ values }) => (values as Record<string, unknown>)['text'] !== 'pinned')
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading', data: { text: 'free' } },
          { type: 'heading', data: { text: 'pinned' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canReorder, undefined)
      assert.equal(m.rows[1]?.canReorder, false)
    })

    it('async predicate is awaited', async () => {
      const f = builder().itemCanDelete(async ({ row }) => {
        await Promise.resolve()
        return row?.index !== 0
      })
      const [raw] = await resolveSchema([f], {
        values: { content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
        ] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows[0]?.canDelete, false)
      assert.equal(m.rows[1]?.canDelete, undefined)
    })

    it('throwing predicate → capability stays enabled (fail-open) + warns', async () => {
      const original = console.warn
      const warnings: unknown[][] = []
      console.warn = (...args: unknown[]) => { warnings.push(args) }
      try {
        const f = builder().itemCanReorder(() => { throw new Error('boom') })
        const [raw] = await resolveSchema([f], {
          values: { content: [{ type: 'heading', data: { text: 'A' } }] },
        })
        const m = metaOf(raw)
        assert.equal(m.rows[0]?.canReorder, undefined)
        assert.ok(warnings.length >= 1, 'expected at least one warning')
        assert.match(String(warnings[0]?.[0]), /itemCanReorder\(\) on Builder "content" threw/)
      } finally {
        console.warn = original
      }
    })
  })

  // ─── Coercion ─────────────────────────────────────────────

  describe('coerceFormValues', () => {
    function builder() {
      return BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text')]),
        Block.make('counter').schema([NumberField.make('count'), ToggleField.make('on')]),
      ])
    }

    it('JSON shape — array round-trips with inner-field coercion', () => {
      const out = coerceFormValues([builder()], {
        content: [
          { __id: 'a', type: 'heading', data: { text: 'X' } },
          { type: 'counter', data: { count: '5', on: 'on' } },
        ],
      })
      assert.deepEqual(out['content'], [
        { __id: 'a', type: 'heading', data: { text: 'X' } },
        { type: 'counter', data: { count: 5, on: true } },
      ])
    })

    it('flat-key shape — folds into {type, data} envelopes', () => {
      const out = coerceFormValues([builder()], {
        'content.0.__id':       'row-a',
        'content.0.type':       'heading',
        'content.0.data.text':  'Hello',
        'content.1.type':       'counter',
        'content.1.data.count': '3',
        'content.1.data.on':    'on',
      })
      assert.deepEqual(out['content'], [
        { __id: 'row-a', type: 'heading', data: { text: 'Hello' } },
        { type: 'counter', data: { count: 3, on: true } },
      ])
      assert.equal(out['content.0.type'], undefined) // flat keys cleaned up
    })

    it('trailing empty rows trimmed (data with no entered values)', () => {
      const out = coerceFormValues([builder()], {
        content: [
          { type: 'heading', data: { text: 'A' } },
          { type: 'heading', data: { text: '' } },
          { type: 'heading', data: { text: '' } },
        ],
      })
      // Trailing empties trimmed. The non-empty first row stays.
      assert.equal((out['content'] as unknown[]).length, 1)
    })

    it('keeps a non-empty trailing row even with empty siblings', () => {
      const out = coerceFormValues([builder()], {
        content: [
          { type: 'heading', data: { text: '' } },
          { type: 'heading', data: { text: 'kept' } },
        ],
      })
      // Only trailing emptiness trims; the first empty row survives the trim.
      assert.equal((out['content'] as unknown[]).length, 2)
    })

    it('unknown block type — data passes through verbatim', () => {
      const out = coerceFormValues([builder()], {
        content: [{ type: 'mysterious', data: { stuff: 'preserved' } }],
      })
      assert.deepEqual(out['content'], [
        { type: 'mysterious', data: { stuff: 'preserved' } },
      ])
    })

    it('non-object row entries → empty rows preserved at non-trailing positions', () => {
      const out = coerceFormValues([builder()], {
        content: [null, 'oops', { type: 'heading', data: { text: 'real' } }],
      })
      const arr = out['content'] as Array<Record<string, unknown>>
      // Non-object entries normalize to `{ type: '', data: {} }`. Only
      // trailing empties trim, so the two empties at positions 0 and 1
      // survive and the real row anchors them.
      assert.equal(arr.length, 3)
      assert.equal(arr[0]?.['type'], '')
      assert.equal(arr[2]?.['type'], 'heading')
    })
  })

  // ─── Validation ───────────────────────────────────────────

  describe('validateSchema', () => {
    function builder() {
      return BuilderField.make('content')
        .blocks([
          Block.make('heading').schema([TextField.make('text').required()]),
          Block.make('paragraph').schema([TextField.make('body').required()]),
        ])
    }

    it('inner required → error keyed name.<i>.data.<child>', async () => {
      const errors = await validateSchema([builder()], {
        content: [{ type: 'heading', data: { text: '' } }],
      })
      assert.ok(errors['content.0.data.text'])
      assert.equal(isValid(errors), false)
    })

    it('minItems violated → bare-key error', async () => {
      const errors = await validateSchema([builder().minItems(2)], {
        content: [{ type: 'heading', data: { text: 'A' } }],
      })
      assert.ok(errors['content']?.some(e => e.includes('At least 2')))
    })

    it('maxItems violated → bare-key error', async () => {
      const errors = await validateSchema([builder().maxItems(1)], {
        content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
        ],
      })
      assert.ok(errors['content']?.some(e => e.includes('At most 1')))
    })

    it('Block.maxItems violated → bare-key error mentioning block label', async () => {
      const f = BuilderField.make('content').blocks([
        Block.make('hero').label('Hero').maxItems(1).schema([TextField.make('h')]),
        Block.make('p').schema([TextField.make('b')]),
      ])
      const errors = await validateSchema([f], {
        content: [
          { type: 'hero', data: { h: 'A' } },
          { type: 'hero', data: { h: 'B' } },
        ],
      })
      assert.ok(errors['content']?.some(e => e.includes('"Hero"')))
    })

    it('unknown block type → row-level error', async () => {
      const errors = await validateSchema([builder()], {
        content: [{ type: 'phantom', data: {} }],
      })
      assert.ok(errors['content.0']?.some(e => e.includes('Unknown')))
    })

    it('missing block type → row-level error', async () => {
      const errors = await validateSchema([builder()], {
        content: [{ type: '', data: {} }],
      })
      assert.ok(errors['content.0']?.some(e => e.includes('required')))
    })

    it('flat-key body folds + validates non-empty rows', async () => {
      // Non-empty data anchors the row past the trailing-empty trim, so
      // validation can run against it. (Trim semantics match Repeater:
      // a row with no entered values is treated as never-created.)
      const errors = await validateSchema([builder()], {
        'content.0.type':      'paragraph',
        'content.0.data.body': '', // touched-but-empty after sibling fills
        // Anchor the row by adding a non-empty key inside data
        'content.0.data.body.touched': 'x',
      })
      // The fold puts `body` AND `body.touched` into data — the latter
      // is treated as a literal string key. The row is non-empty.
      // Required validation fires for body.
      assert.ok(errors['content.0.data.body'])
    })
  })

  describe('distinct() — cross-row uniqueness (per block type)', () => {
    function distinctBuilder() {
      return BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text').distinct()]),
        Block.make('paragraph').schema([TextField.make('body').distinct()]),
      ])
    }

    it('all-unique rows produce no error', async () => {
      const errors = await validateSchema([distinctBuilder()], {
        content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'heading',   data: { text: 'B' } },
          { type: 'paragraph', data: { body: 'A' } },
        ],
      })
      assert.equal(isValid(errors), true)
    })

    it('duplicate within the same block flags the second occurrence', async () => {
      const errors = await validateSchema([distinctBuilder()], {
        content: [
          { type: 'heading', data: { text: 'A' } },
          { type: 'heading', data: { text: 'A' } },
        ],
      })
      assert.equal('content.0.data.text' in errors, false)
      assert.deepEqual(errors['content.1.data.text'], ['Must be unique'])
    })

    it('comparison is scoped to same block type — different blocks with the same field-name value never conflict', async () => {
      // Both schemas happen to have a `text` field marked distinct (renamed
      // here so the assertion is explicit). A heading block's value should
      // never be compared against a paragraph block's value.
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('val').distinct()]),
        Block.make('paragraph').schema([TextField.make('val').distinct()]),
      ])
      const errors = await validateSchema([f], {
        content: [
          { type: 'heading',   data: { val: 'A' } },
          { type: 'paragraph', data: { val: 'A' } }, // same value, different block
        ],
      })
      assert.equal(isValid(errors), true)
    })

    it('non-contiguous rows of the same type still conflict', async () => {
      // heading(A) at idx 0, paragraph at idx 1, heading(A) at idx 2 → idx 2 fails.
      const errors = await validateSchema([distinctBuilder()], {
        content: [
          { type: 'heading',   data: { text: 'A' } },
          { type: 'paragraph', data: { body: 'B' } },
          { type: 'heading',   data: { text: 'A' } },
        ],
      })
      assert.deepEqual(errors['content.2.data.text'], ['Must be unique'])
    })

    it('caseInsensitive folds case before comparing', async () => {
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([TextField.make('text').distinct({ caseInsensitive: true })]),
      ])
      const errors = await validateSchema([f], {
        content: [
          { type: 'heading', data: { text: 'Foo' } },
          { type: 'heading', data: { text: 'foo' } },
        ],
      })
      assert.deepEqual(errors['content.1.data.text'], ['Must be unique'])
    })

    it('default ignoreNulls=true skips empty values', async () => {
      const errors = await validateSchema([distinctBuilder()], {
        content: [
          { type: 'heading', data: { text: '' } },
          { type: 'heading', data: { text: '' } },
        ],
      })
      // The required-style check isn't on this field, so empty rows pass.
      assert.equal(isValid(errors), true)
    })

    it('custom message overrides the default', async () => {
      const f = BuilderField.make('content').blocks([
        Block.make('heading').schema([
          TextField.make('text').distinct({ message: 'Each heading text must be unique' }),
        ]),
      ])
      const errors = await validateSchema([f], {
        content: [
          { type: 'heading', data: { text: 'A' } },
          { type: 'heading', data: { text: 'A' } },
        ],
      })
      assert.deepEqual(errors['content.1.data.text'], ['Each heading text must be unique'])
    })

    it('unknown block rows are skipped (no crash, no false dup)', async () => {
      const errors = await validateSchema([distinctBuilder()], {
        content: [
          { type: 'heading', data: { text: 'A' } },
          { type: 'phantom', data: { text: 'A' } },   // unknown block type
        ],
      })
      // Row 1 produces an "Unknown block type" error but no distinct error.
      assert.ok(errors['content.1']?.some(e => e.includes('Unknown')))
      assert.equal('content.1.data.text' in errors, false)
    })
  })

  // ─── Live re-resolve (applyStateUpdate) ──────────────────

  describe('applyStateUpdate (dotted path)', () => {
    function form() {
      return Form.make().schema([
        BuilderField.make('content').blocks([
          Block.make('heading').schema([TextField.make('text').live()]),
          Block.make('counter').schema([NumberField.make('count').live()]),
        ]),
      ])
    }

    it('updates the leaf field at the dotted path', async () => {
      const f = form()
      const result = await applyStateUpdate(
        f,
        { content: [{ type: 'heading', data: { text: 'Hello' } }] },
        'content.0.data.text',
      )
      assert.notEqual(result, null)
      const root = result!.values['content'] as Array<Record<string, unknown>>
      const data = root[0]!['data'] as Record<string, unknown>
      assert.equal(data['text'], 'Hello')
      assert.deepEqual(result!.dirty, ['content.0.data.text'])
    })

    it('coerces the leaf only — sibling values untouched', async () => {
      const f = form()
      const result = await applyStateUpdate(
        f,
        { content: [{ type: 'counter', data: { count: '7' } }] },
        'content.0.data.count',
      )
      assert.notEqual(result, null)
      const root = result!.values['content'] as Array<Record<string, unknown>>
      const data = root[0]!['data'] as Record<string, unknown>
      assert.equal(data['count'], 7)
    })

    it('routes by row.type, not field — wrong-type leaf 404s', async () => {
      const f = form()
      const result = await applyStateUpdate(
        f,
        { content: [{ type: 'heading', data: {} }] },
        'content.0.data.count', // 'count' belongs to counter, not heading
      )
      assert.equal(result, null)
    })

    it('returns null for unsupported nested array-row paths', async () => {
      const f = form()
      const result = await applyStateUpdate(
        f,
        { content: [{ type: 'heading', data: {} }] },
        'content.0.data.text.0.something',
      )
      assert.equal(result, null)
    })

    it('afterStateUpdated receives row-scoped $get + ctx.row.blockType', async () => {
      let blockTypeSeen: string | undefined
      let rowTextSeen:   unknown
      const f = Form.make().schema([
        BuilderField.make('content').blocks([
          Block.make('heading').schema([
            TextField.make('text').live(),
            TextField.make('subtitle').live().afterStateUpdated((value, ctx) => {
              void value
              if (ctx.row) {
                blockTypeSeen = ctx.row.blockType
                rowTextSeen   = ctx.row.$get('text')
              }
            }),
          ]),
        ]),
      ])
      await applyStateUpdate(
        f,
        { content: [{ type: 'heading', data: { text: 'Existing', subtitle: 'New' } }] },
        'content.0.data.subtitle',
      )
      assert.equal(blockTypeSeen, 'heading')
      assert.equal(rowTextSeen,   'Existing')
    })
  })

  // ─── Walkers stop at Builder boundary ────────────────────

  describe('walker boundaries', () => {
    it('findForms does not recurse into Builder rows', () => {
      const inner  = Form.make().schema([TextField.make('inner')])
      const outer  = Form.make().schema([
        BuilderField.make('content').blocks([
          Block.make('h').schema([inner as unknown as TextField]), // intentional misuse
        ]),
      ])
      const forms = findForms([outer])
      assert.equal(forms.length, 1)
      assert.equal(forms[0], outer)
    })

    it('findActions does not recurse into Builder rows', () => {
      const innerAction = Action.make('inner-action').handler(() => {})
      const outer = BuilderField.make('content').blocks([
        Block.make('h').schema([innerAction as unknown as TextField]),
      ])
      assert.deepEqual(findActions([outer]), [])
    })

    it('findTables does not recurse into Builder rows', () => {
      const innerTable = Table.make().columns([])
      const outer = BuilderField.make('content').blocks([
        Block.make('h').schema([innerTable as unknown as TextField]),
      ])
      assert.deepEqual(findTables([outer]), [])
    })

    it('isBuilderField structural check', () => {
      assert.equal(isBuilderField(BuilderField.make('x')),  true)
      assert.equal(isBuilderField(RepeaterField.make('x')), false)
      assert.equal(isBuilderField(TextField.make('x')),     false)
      assert.equal(isBuilderField(Section.make('x')),       false)
    })

    it('isBuilderField narrow check passes structural shape (Vite SSR safety)', () => {
      // Simulates a duplicate-module-cache copy: a plain object whose
      // discriminators match. The structural check should still catch it.
      const fake = { getType: () => 'field', fieldType: 'builder' }
      assert.equal(isBuilderField(fake), true)
    })
  })

  describe('extraItemActions (per-row buttons)', () => {
    it('builder stores extra actions; getter returns them', () => {
      const a = Action.make('promote').handler(() => undefined)
      const f = BuilderField.make('content').extraItemActions([a])
      assert.deepEqual(f.getExtraItemActions(), [a])
    })

    it('per-row resolve stamps extraActions on each row', async () => {
      const promote = Action.make('promote').handler(() => undefined)
      const f = BuilderField.make('content')
        .blocks([
          Block.make('heading').schema([TextField.make('text')]),
        ])
        .extraItemActions([promote])

      const [meta] = await resolveSchema([f], { values: { content: [
        { type: 'heading', data: { text: 'A' } },
        { type: 'heading', data: { text: 'B' } },
      ] } })
      const builder = meta as BuilderFieldMeta
      assert.equal(builder.rows.length, 2)
      assert.equal(builder.rows[0]!.extraActions?.length, 1)
      assert.equal(builder.rows[1]!.extraActions?.length, 1)
    })

    it('predicate sees row data via ctx.values', async () => {
      const seen: Array<Record<string, unknown> | undefined> = []
      const a = Action.make('a')
        .handler(() => undefined)
        .visible(({ values }) => { seen.push(values); return true })
      const f = BuilderField.make('content')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .extraItemActions([a])

      await resolveSchema([f], { values: { content: [
        { type: 'heading', data: { text: 'foo' } },
      ] } })
      assert.deepEqual(seen, [{ text: 'foo' }])
    })

    it('unknown-type rows skip extraActions resolve (no row context)', async () => {
      const promote = Action.make('promote').handler(() => undefined)
      const f = BuilderField.make('content')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .extraItemActions([promote])

      const [meta] = await resolveSchema([f], { values: { content: [
        { type: 'mystery', data: { foo: 'bar' } },
      ] } })
      const builder = meta as BuilderFieldMeta
      assert.equal(builder.rows[0]!.unknownType, true)
      assert.equal(builder.rows[0]!.extraActions, undefined)
    })
  })

  describe('relationship(...) — setter / getter / meta', () => {
    it('string form stores the relationship name', () => {
      const f = BuilderField.make('content')
        .relationship('blocks')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
      const cfg = f.getRelationship()
      assert.equal(f.isRelationship(), true)
      assert.equal(cfg?.name, 'blocks')
      assert.equal(cfg?.model,       undefined)
      assert.equal(cfg?.foreignKey,  undefined)
      assert.equal(cfg?.typeColumn,  undefined)
      assert.equal(cfg?.dataColumn,  undefined)
      assert.equal(cfg?.orderColumn, undefined)
    })

    it('object form copies all explicit overrides verbatim', () => {
      const f = BuilderField.make('content')
        .relationship({
          name:        'blocks',
          foreignKey:  'pageId',
          typeColumn:  'kind',
          dataColumn:  'payload',
          orderColumn: 'sort',
        })
        .blocks([Block.make('heading').schema([TextField.make('text')])])
      const cfg = f.getRelationship()
      assert.equal(cfg?.name,        'blocks')
      assert.equal(cfg?.foreignKey,  'pageId')
      assert.equal(cfg?.typeColumn,  'kind')
      assert.equal(cfg?.dataColumn,  'payload')
      assert.equal(cfg?.orderColumn, 'sort')
    })

    it('orderColumn() sugar sets the order column when relationship is configured', () => {
      const f = BuilderField.make('content')
        .relationship('blocks')
        .orderColumn('sort')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
      assert.equal(f.getRelationship()?.orderColumn, 'sort')
    })

    it('orderColumn() throws when relationship() not called first', () => {
      assert.throws(
        () => BuilderField.make('content').orderColumn('sort'),
        /requires relationship\(\) to be configured first/,
      )
    })

    it('relationship() is incompatible with dehydrated(false)', () => {
      assert.throws(
        () => BuilderField.make('content').dehydrated(false).relationship('blocks'),
        /incompatible with dehydrated\(false\)/,
      )
    })

    it('toMeta serializes relationship under meta.relationship — only name when no overrides', () => {
      const meta = BuilderField.make('content')
        .relationship('blocks')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .toMeta() as BuilderFieldMeta
      assert.deepEqual(meta.relationship, { name: 'blocks' })
    })

    it('toMeta omits server-only model + foreignKey, preserves typeColumn / dataColumn / orderColumn', () => {
      const meta = BuilderField.make('content')
        .relationship({
          name:        'blocks',
          foreignKey:  'pageId',
          typeColumn:  'kind',
          dataColumn:  'payload',
          orderColumn: 'sort',
        })
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .toMeta() as BuilderFieldMeta
      assert.deepEqual(meta.relationship, {
        name:        'blocks',
        typeColumn:  'kind',
        dataColumn:  'payload',
        orderColumn: 'sort',
      })
      assert.equal('model'      in (meta.relationship as object), false)
      assert.equal('foreignKey' in (meta.relationship as object), false)
    })

    it('toMeta omits relationship key entirely when not configured', () => {
      const meta = BuilderField.make('content')
        .blocks([Block.make('heading').schema([TextField.make('text')])])
        .toMeta() as BuilderFieldMeta
      assert.equal(meta.relationship, undefined)
    })
  })
})
