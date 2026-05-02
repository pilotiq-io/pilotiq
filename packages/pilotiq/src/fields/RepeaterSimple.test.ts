import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RepeaterField, type RepeaterFieldMeta } from './RepeaterField.js'
import { TextField } from './TextField.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import {
  coerceFormValues,
  unwrapSimpleRepeaters,
  dispatchFormSubmit,
} from '../elements/dispatchForm.js'
import { Form } from '../elements/Form.js'
import { validateSchema, isValid } from '../validation/index.js'

function metaOf(m: unknown): RepeaterFieldMeta { return m as RepeaterFieldMeta }

describe('Repeater.simple(field) — flat-array storage shape', () => {
  describe('flag plumbing', () => {
    it('isSimple() defaults false; simple() flips it true', () => {
      const f = RepeaterField.make('tags')
      assert.equal(f.isSimple(), false)
      f.simple(TextField.make('tag'))
      assert.equal(f.isSimple(), true)
    })

    it('simple() sets the inner schema to the single field', () => {
      const inner = TextField.make('tag')
      const f = RepeaterField.make('tags').simple(inner)
      assert.deepEqual(f.getInnerSchema(), [inner])
      assert.equal(f.getSimpleInnerField(), inner)
    })

    it('simple() replaces any prior schema()', () => {
      const f = RepeaterField.make('tags')
        .schema([TextField.make('a'), TextField.make('b')])
        .simple(TextField.make('tag'))
      assert.equal(f.getInnerSchema().length, 1)
    })

    it('emits meta.simple = true', () => {
      const m = RepeaterField.make('tags').simple(TextField.make('tag')).toMeta()
      assert.equal(m.simple, true)
    })

    it('non-simple repeaters omit meta.simple', () => {
      const m = RepeaterField.make('items').schema([TextField.make('x')]).toMeta()
      assert.equal('simple' in m, false)
    })

    it('getSimpleInnerField() returns undefined outside simple mode', () => {
      const f = RepeaterField.make('items').schema([TextField.make('x')])
      assert.equal(f.getSimpleInnerField(), undefined)
    })
  })

  describe('resolve — wraps flat array entries inline', () => {
    function makeRep() {
      return RepeaterField.make('tags').simple(TextField.make('tag'))
    }

    it('flat record value [v1, v2] → row children mounted with right name', async () => {
      const [raw] = await resolveSchema([makeRep()], {
        values: { tags: ['red', 'green', 'blue'] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows.length, 3)
      // Each row's first child is a TextField named 'tag'.
      for (const row of m.rows) {
        const child = row.children[0] as unknown as { name?: string }
        assert.equal(child.name, 'tag')
      }
    })

    it('already-wrapped value [{tag:v}] still works (idempotent)', async () => {
      const [raw] = await resolveSchema([makeRep()], {
        values: { tags: [{ tag: 'red' }, { tag: 'blue' }] },
      })
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
    })

    it('empty array → zero rows (defaultItems is not applied when an array exists)', async () => {
      const [raw] = await resolveSchema([makeRep()], { values: { tags: [] } })
      const m = metaOf(raw)
      assert.equal(m.rows.length, 0)
    })

    it('no submitted value → defaultItems empty rows', async () => {
      const [raw] = await resolveSchema([makeRep().defaultItems(2)])
      const m = metaOf(raw)
      assert.equal(m.rows.length, 2)
    })
  })

  describe('coerce — produces wrapped shape, then unwrapSimpleRepeaters flattens', () => {
    function makeRep() {
      return RepeaterField.make('tags').simple(TextField.make('tag'))
    }

    it('flat-key form body folds + unwraps to flat array', () => {
      const data = coerceFormValues([makeRep()], {
        'tags.0.tag': 'red',
        'tags.1.tag': 'green',
      })
      // Coerce alone produces wrapped shape:
      assert.deepEqual(data['tags'], [{ tag: 'red' }, { tag: 'green' }])
      // unwrapSimpleRepeaters flattens.
      const out = unwrapSimpleRepeaters([makeRep()], data)
      assert.deepEqual(out['tags'], ['red', 'green'])
    })

    it('JSON body with primitive entries is wrapped, then unwrapped', () => {
      const data = coerceFormValues([makeRep()], {
        tags: ['red', 'green', 'blue'],
      })
      const out = unwrapSimpleRepeaters([makeRep()], data)
      assert.deepEqual(out['tags'], ['red', 'green', 'blue'])
    })

    it('drops trailing empty rows like a regular Repeater', () => {
      const data = coerceFormValues([makeRep()], {
        'tags.0.tag': 'red',
        'tags.1.tag': '',
      })
      const out = unwrapSimpleRepeaters([makeRep()], data)
      assert.deepEqual(out['tags'], ['red'])
    })

    it('dehydrated(false) removes the field entirely', () => {
      const f = makeRep().dehydrated(false)
      const data = coerceFormValues([f], { 'tags.0.tag': 'red' })
      assert.equal('tags' in data, false)
      const out = unwrapSimpleRepeaters([f], data)
      assert.equal('tags' in out, false)
    })

    it('non-simple repeaters are untouched by unwrap', () => {
      const f = RepeaterField.make('items').schema([
        TextField.make('product'),
      ])
      const data = coerceFormValues([f], { 'items.0.product': 'A' })
      const out = unwrapSimpleRepeaters([f], data)
      assert.deepEqual(out['items'], [{ product: 'A' }])
    })
  })

  describe('validation — runs against wrapped row shape transparently', () => {
    function makeRep() {
      return RepeaterField.make('tags').simple(
        TextField.make('tag').required(),
      )
    }

    it('flat array — required check fires on each empty row', async () => {
      const errors = await validateSchema([makeRep()], {
        tags: ['red', '', 'blue'],
      })
      assert.deepEqual(errors['tags.1.tag'], ['This field is required'])
    })

    it('all valid — no errors', async () => {
      const errors = await validateSchema([makeRep()], {
        tags: ['red', 'green'],
      })
      assert.equal(isValid(errors), true)
    })

    it('flat-key body folds + validates non-trailing empty rows', async () => {
      // Trailing empty rows are trimmed by `foldFlatRepeaterRows` (same
      // posture as a non-simple Repeater); a non-trailing empty row
      // survives and fires the required check.
      const errors = await validateSchema([makeRep()], {
        'tags.0.tag': 'red',
        'tags.1.tag': '',
        'tags.2.tag': 'blue',
      })
      assert.deepEqual(errors['tags.1.tag'], ['This field is required'])
    })

    it('minItems / maxItems work', async () => {
      const f = RepeaterField.make('tags')
        .simple(TextField.make('tag'))
        .minItems(2)
      const errors = await validateSchema([f], { tags: ['only-one'] })
      assert.deepEqual(errors['tags'], ['At least 2 items are required'])
    })

    it('distinct() works against flat values', async () => {
      const f = RepeaterField.make('tags').simple(
        TextField.make('tag').distinct(),
      )
      const errors = await validateSchema([f], {
        tags: ['red', 'red', 'blue'],
      })
      assert.deepEqual(errors['tags.1.tag'], ['Must be unique'])
    })
  })

  describe('end-to-end form submit — save() handler receives flat array', () => {
    it('flat-key body → flat array delivered to save()', async () => {
      let saved: unknown = null
      const form = Form.make<unknown>().schema([
        RepeaterField.make('tags').simple(TextField.make('tag')),
      ]).save(async (data) => {
        saved = data
        return data
      })

      const result = await dispatchFormSubmit(form, {
        'tags.0.tag': 'red',
        'tags.1.tag': 'green',
      }, { values: {} })
      assert.equal(result.ok, true)
      assert.deepEqual((saved as Record<string, unknown>)['tags'], ['red', 'green'])
    })

    it('JSON body with primitive array → flat array delivered to save()', async () => {
      let saved: unknown = null
      const form = Form.make<unknown>().schema([
        RepeaterField.make('tags').simple(TextField.make('tag')),
      ]).save(async (data) => {
        saved = data
        return data
      })

      const result = await dispatchFormSubmit(form, {
        tags: ['red', 'green', 'blue'],
      }, { values: {} })
      assert.equal(result.ok, true)
      assert.deepEqual((saved as Record<string, unknown>)['tags'], ['red', 'green', 'blue'])
    })

    it('validation errors short-circuit before unwrap (errors keyed normally)', async () => {
      const form = Form.make<unknown>().schema([
        RepeaterField.make('tags').simple(
          TextField.make('tag').required(),
        ),
      ]).save(async (data) => data)

      const result = await dispatchFormSubmit(form, {
        tags: ['red', ''],
      }, { values: {} })
      assert.equal(result.ok, false)
      if (result.ok) return
      assert.deepEqual(result.errors['tags.1.tag'], ['This field is required'])
    })
  })
})
