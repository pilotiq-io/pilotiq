import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { SelectField } from './SelectField.js'
import { RadioField } from './RadioField.js'
import { CheckboxListField } from './CheckboxListField.js'
import { ToggleButtonsField } from './ToggleButtonsField.js'
import { TextField } from './TextField.js'
import { RepeaterField, type RepeaterFieldMeta } from './RepeaterField.js'
import { BuilderField, type BuilderFieldMeta } from './BuilderField.js'
import { Block } from '../schema/Block.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { disableOptionsTakenInSiblings, type ResolvedSelectOption } from './optionsResolver.js'

const colours = [
  { value: 'red',   label: 'Red'   },
  { value: 'green', label: 'Green' },
  { value: 'blue',  label: 'Blue'  },
]

function rowOptions(meta: RepeaterFieldMeta | BuilderFieldMeta, rowIdx: number, fieldName: string): ResolvedSelectOption[] {
  const row = meta.rows[rowIdx]
  if (!row) throw new Error(`row ${rowIdx} missing`)
  const child = row.children.find(c => c['name'] === fieldName)
  if (!child) throw new Error(`field "${fieldName}" missing in row ${rowIdx}`)
  return (child['options'] as ResolvedSelectOption[]) ?? []
}

describe('disableOptionsWhenSelectedInSiblingRepeaterItems', () => {
  describe('flag plumbing', () => {
    it('default is disabled', () => {
      const f = SelectField.make('color')
      assert.equal(f.shouldDisableOptionsTakenInSiblings(), false)
    })

    it('enables flag + auto-arms distinct() and live()', () => {
      const f = SelectField.make('color').disableOptionsWhenSelectedInSiblingRepeaterItems()
      assert.equal(f.shouldDisableOptionsTakenInSiblings(), true)
      assert.notEqual(f.getDistinct(), undefined)
      assert.equal(f.isLive(), true)
    })

    it('disableOptionsWhenSelectedInSiblingRepeaterItems(false) clears the flag', () => {
      const f = SelectField.make('color').disableOptionsWhenSelectedInSiblingRepeaterItems()
        .disableOptionsWhenSelectedInSiblingRepeaterItems(false)
      assert.equal(f.shouldDisableOptionsTakenInSiblings(), false)
    })

    it('available on Radio / CheckboxList / ToggleButtons too', () => {
      assert.equal(
        RadioField.make('x').disableOptionsWhenSelectedInSiblingRepeaterItems().shouldDisableOptionsTakenInSiblings(),
        true,
      )
      assert.equal(
        CheckboxListField.make('x').disableOptionsWhenSelectedInSiblingRepeaterItems().shouldDisableOptionsTakenInSiblings(),
        true,
      )
      assert.equal(
        ToggleButtonsField.make('x').disableOptionsWhenSelectedInSiblingRepeaterItems().shouldDisableOptionsTakenInSiblings(),
        true,
      )
    })
  })

  describe('disableOptionsTakenInSiblings helper', () => {
    it('no-op when disabled', () => {
      const out = disableOptionsTakenInSiblings(colours, false, 'color', { row: { index: 0, $get: () => undefined, $set: () => {}, siblings: [{ color: 'red' }] } })
      assert.deepEqual(out, colours)
    })

    it('no-op without row.siblings (top-level form)', () => {
      const out = disableOptionsTakenInSiblings(colours, true, 'color', undefined)
      assert.deepEqual(out, colours)
    })

    it('marks taken values disabled', () => {
      const out = disableOptionsTakenInSiblings(colours, true, 'color', {
        row: { index: 1, $get: () => undefined, $set: () => {}, siblings: [{ color: 'red' }] },
      })
      assert.equal(out[0]?.disabled, true)   // red is taken
      assert.equal(out[1]?.disabled, undefined)
      assert.equal(out[2]?.disabled, undefined)
    })

    it('skips empty / null sibling values', () => {
      const out = disableOptionsTakenInSiblings(colours, true, 'color', {
        row: {
          index: 1,
          $get: () => undefined,
          $set: () => {},
          siblings: [{ color: '' }, { color: null }, { color: undefined }, { other: 'red' }],
        },
      })
      assert.equal(out[0]?.disabled, undefined)
      assert.equal(out[1]?.disabled, undefined)
    })

    it('unfolds array sibling values (CheckboxList semantics)', () => {
      const out = disableOptionsTakenInSiblings(colours, true, 'tags', {
        row: { index: 1, $get: () => undefined, $set: () => {}, siblings: [{ tags: ['red', 'blue'] }] },
      })
      assert.equal(out[0]?.disabled, true)
      assert.equal(out[1]?.disabled, undefined)
      assert.equal(out[2]?.disabled, true)
    })

    it('preserves user-set option.disabled (does not toggle it back to undefined)', () => {
      const opts: ResolvedSelectOption[] = [
        { value: 'red', label: 'Red', disabled: true },
        { value: 'green', label: 'Green' },
      ]
      const out = disableOptionsTakenInSiblings(opts, true, 'color', {
        row: { index: 1, $get: () => undefined, $set: () => {}, siblings: [{ color: 'green' }] },
      })
      assert.equal(out[0]?.disabled, true)   // user-set, untouched
      assert.equal(out[1]?.disabled, true)   // newly taken
    })
  })

  describe('inside Repeater', () => {
    function makeRep() {
      return RepeaterField.make('picks').schema([
        SelectField.make('color')
          .options(colours)
          .disableOptionsWhenSelectedInSiblingRepeaterItems(),
      ])
    }

    it('first row sees all options enabled when no sibling has picked', async () => {
      const [raw] = await resolveSchema([makeRep()], {
        values: { picks: [{ color: '' }, { color: '' }] },
      })
      const m = raw as RepeaterFieldMeta
      assert.equal(rowOptions(m, 0, 'color').every(o => !o.disabled), true)
      assert.equal(rowOptions(m, 1, 'color').every(o => !o.disabled), true)
    })

    it('when row 0 picks "red", row 1 sees red disabled', async () => {
      const [raw] = await resolveSchema([makeRep()], {
        values: { picks: [{ color: 'red' }, { color: '' }] },
      })
      const m = raw as RepeaterFieldMeta
      const row1 = rowOptions(m, 1, 'color')
      assert.equal(row1.find(o => o.value === 'red')?.disabled, true)
      assert.equal(row1.find(o => o.value === 'green')?.disabled, undefined)
      assert.equal(row1.find(o => o.value === 'blue')?.disabled, undefined)
    })

    it('the picking row keeps its own pick selectable (not disabled by self)', async () => {
      const [raw] = await resolveSchema([makeRep()], {
        values: { picks: [{ color: 'red' }, { color: 'green' }] },
      })
      const m = raw as RepeaterFieldMeta
      // Row 0 sees its own red as enabled (siblings = [{green}])
      assert.equal(rowOptions(m, 0, 'color').find(o => o.value === 'red')?.disabled, undefined)
      // Row 1 sees its own green as enabled (siblings = [{red}])
      assert.equal(rowOptions(m, 1, 'color').find(o => o.value === 'green')?.disabled, undefined)
      // … but the OTHER row's pick is disabled
      assert.equal(rowOptions(m, 0, 'color').find(o => o.value === 'green')?.disabled, true)
      assert.equal(rowOptions(m, 1, 'color').find(o => o.value === 'red')?.disabled, true)
    })

    it('flag off → no options ever disabled (sanity check)', async () => {
      const f = RepeaterField.make('picks').schema([
        SelectField.make('color').options(colours), // no disable flag
      ])
      const [raw] = await resolveSchema([f], {
        values: { picks: [{ color: 'red' }, { color: '' }] },
      })
      const m = raw as RepeaterFieldMeta
      assert.equal(rowOptions(m, 1, 'color').find(o => o.value === 'red')?.disabled, undefined)
    })

    it('CheckboxList — sibling array values mark each entry disabled', async () => {
      const f = RepeaterField.make('groups').schema([
        CheckboxListField.make('tags')
          .options(colours)
          .disableOptionsWhenSelectedInSiblingRepeaterItems(),
      ])
      const [raw] = await resolveSchema([f], {
        values: { groups: [{ tags: ['red', 'blue'] }, { tags: [] }] },
      })
      const m = raw as RepeaterFieldMeta
      const row1 = rowOptions(m, 1, 'tags')
      assert.equal(row1.find(o => o.value === 'red')?.disabled, true)
      assert.equal(row1.find(o => o.value === 'blue')?.disabled, true)
      assert.equal(row1.find(o => o.value === 'green')?.disabled, undefined)
    })

    it('Radio + ToggleButtons honor the flag the same way', async () => {
      const f = RepeaterField.make('rows').schema([
        RadioField.make('r').options(colours).disableOptionsWhenSelectedInSiblingRepeaterItems(),
        ToggleButtonsField.make('t').options(colours).disableOptionsWhenSelectedInSiblingRepeaterItems(),
      ])
      const [raw] = await resolveSchema([f], {
        values: { rows: [{ r: 'red', t: 'blue' }, { r: '', t: '' }] },
      })
      const m = raw as RepeaterFieldMeta
      assert.equal(rowOptions(m, 1, 'r').find(o => o.value === 'red')?.disabled, true)
      assert.equal(rowOptions(m, 1, 't').find(o => o.value === 'blue')?.disabled, true)
    })

    it('top-level (non-Repeater) Select with the flag set is a no-op', async () => {
      const top = SelectField.make('color').options(colours).disableOptionsWhenSelectedInSiblingRepeaterItems()
      const [raw] = await resolveSchema([top], { values: { color: 'red' } })
      const opts = (raw?.['options'] as ResolvedSelectOption[]) ?? []
      assert.equal(opts.every(o => !o.disabled), true)
    })

    it('zero submitted rows + defaultItems → no errors, options all enabled', async () => {
      const [raw] = await resolveSchema([makeRep().defaultItems(2)])
      const m = raw as RepeaterFieldMeta
      // Two empty default rows; nobody has picked anything yet.
      assert.equal(rowOptions(m, 0, 'color').every(o => !o.disabled), true)
      assert.equal(rowOptions(m, 1, 'color').every(o => !o.disabled), true)
    })
  })

  describe('inside Builder (per-block-type scoping)', () => {
    function makeBuilder() {
      return BuilderField.make('blocks').blocks([
        Block.make('hero').schema([
          SelectField.make('layout').options([
            { value: 'left',  label: 'Left'  },
            { value: 'right', label: 'Right' },
          ]).disableOptionsWhenSelectedInSiblingRepeaterItems(),
        ]),
        Block.make('cta').schema([
          // Same field name on a different block type — must NOT shadow.
          SelectField.make('layout').options([
            { value: 'left',  label: 'Left'  },
            { value: 'right', label: 'Right' },
          ]).disableOptionsWhenSelectedInSiblingRepeaterItems(),
        ]),
      ])
    }

    it('same-type sibling pick disables the option on the next same-type row', async () => {
      const [raw] = await resolveSchema([makeBuilder()], {
        values: { blocks: [
          { type: 'hero', data: { layout: 'left' } },
          { type: 'hero', data: { layout: '' } },
        ] },
      })
      const m = raw as BuilderFieldMeta
      const row1 = rowOptions(m, 1, 'layout')
      assert.equal(row1.find(o => o.value === 'left')?.disabled, true)
      assert.equal(row1.find(o => o.value === 'right')?.disabled, undefined)
    })

    it('different block types DO NOT shadow each other (cross-block isolation)', async () => {
      const [raw] = await resolveSchema([makeBuilder()], {
        values: { blocks: [
          { type: 'hero', data: { layout: 'left' } },
          { type: 'cta',  data: { layout: '' } },
        ] },
      })
      const m = raw as BuilderFieldMeta
      // The cta row at index 1 is a different block — its `layout` is its
      // own namespace. None of its options should be disabled by the hero
      // row's pick.
      const row1 = rowOptions(m, 1, 'layout')
      assert.equal(row1.every(o => !o.disabled), true)
    })

    it('three rows, two same-type → only the third sees both prior picks disabled', async () => {
      const [raw] = await resolveSchema([makeBuilder()], {
        values: { blocks: [
          { type: 'hero', data: { layout: 'left'  } },
          { type: 'hero', data: { layout: 'right' } },
          { type: 'hero', data: { layout: ''      } },
        ] },
      })
      const m = raw as BuilderFieldMeta
      const row2 = rowOptions(m, 2, 'layout')
      assert.equal(row2.find(o => o.value === 'left')?.disabled, true)
      assert.equal(row2.find(o => o.value === 'right')?.disabled, true)
    })
  })

  describe('static option.disabled is preserved alongside taken-disabled', () => {
    it('user-set disabled stays even when not taken', async () => {
      const f = RepeaterField.make('picks').schema([
        SelectField.make('color')
          .options([
            { value: 'red',   label: 'Red'   },
            { value: 'green', label: 'Green', disabled: true },
            { value: 'blue',  label: 'Blue'  },
          ])
          .disableOptionsWhenSelectedInSiblingRepeaterItems(),
      ])
      const [raw] = await resolveSchema([f], {
        values: { picks: [{ color: 'red' }, { color: '' }] },
      })
      const m = raw as RepeaterFieldMeta
      const row1 = rowOptions(m, 1, 'color')
      assert.equal(row1.find(o => o.value === 'red')?.disabled, true)    // taken
      assert.equal(row1.find(o => o.value === 'green')?.disabled, true)  // user-set
      assert.equal(row1.find(o => o.value === 'blue')?.disabled, undefined)
    })
  })

  describe('cross-row interaction with non-option fields', () => {
    it('coexists with sibling fields that are not option-bearing', async () => {
      const f = RepeaterField.make('rows').schema([
        TextField.make('title'),
        SelectField.make('color').options(colours).disableOptionsWhenSelectedInSiblingRepeaterItems(),
      ])
      const [raw] = await resolveSchema([f], {
        values: { rows: [
          { title: 'A', color: 'red' },
          { title: 'B', color: '' },
        ] },
      })
      const m = raw as RepeaterFieldMeta
      assert.equal(rowOptions(m, 1, 'color').find(o => o.value === 'red')?.disabled, true)
    })
  })
})
