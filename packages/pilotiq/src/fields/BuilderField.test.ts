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

    it('addable(false) / deletable(false) emit only when off', () => {
      const on  = BuilderField.make('x').toMeta()
      assert.equal('addable'   in on, false)
      assert.equal('deletable' in on, false)
      const off = BuilderField.make('x').addable(false).deletable(false).toMeta()
      assert.equal(off.addable,   false)
      assert.equal(off.deletable, false)
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
})
