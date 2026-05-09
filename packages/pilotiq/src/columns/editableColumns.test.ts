import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextInputColumn, ToggleColumn, SelectColumn } from './index.js'
import { Column } from '../Column.js'
import { required, minLength, makeValidator } from '../validation/index.js'

describe('Column — editable surface', () => {
  it('isEditable() is false for plain Column.make()', () => {
    assert.equal(Column.make('x').isEditable(), false)
  })

  it('isEditable() is true for TextInput / Toggle / Select', () => {
    assert.equal(TextInputColumn.make('a').isEditable(), true)
    assert.equal(ToggleColumn.make('b').isEditable(),    true)
    assert.equal(SelectColumn.make('c').isEditable(),    true)
  })

  it('required() + validate() compose like Field', async () => {
    const col = TextInputColumn.make('title')
      .required()
      .validate(minLength(3))
    const errs = await col.runValidators('')
    assert.deepEqual(errs, ['This field is required'])
    const errs2 = await col.runValidators('ab')
    assert.deepEqual(errs2, ['Must be at least 3 characters'])
    const errs3 = await col.runValidators('abc')
    assert.deepEqual(errs3, [])
  })

  it('explicit required() validator suppresses the implicit one', async () => {
    const col = TextInputColumn.make('title')
      .required()
      .validate(required('You must provide a title'))
    const errs = await col.runValidators('')
    assert.deepEqual(errs, ['You must provide a title'])
  })

  it('validate(array) appends in order', async () => {
    const a = makeValidator(() => 'A')
    const b = makeValidator(() => 'B')
    const col = TextInputColumn.make('x').validate([a, b])
    const errs = await col.runValidators('y')
    assert.deepEqual(errs, ['A', 'B'])
  })

  it('confirm() round-trips on the meta', () => {
    const meta = ToggleColumn.make('featured').confirm('Sure?').toMeta()
    assert.equal(meta.confirm, 'Sure?')
  })

  it('disabled() static lands as meta.disabled = true', () => {
    const meta = SelectColumn.make('status').disabled().toMeta()
    assert.equal(meta.disabled, true)
  })

  it('disabled(fn) does NOT land on the column meta — it stamps per row', () => {
    const meta = SelectColumn.make('status')
      .disabled(record => record['archived'] === true)
      .toMeta()
    assert.equal(meta.disabled, undefined)
  })

  it('isDisabledFor() runs the predicate per row', () => {
    const col = SelectColumn.make('status')
      .disabled(record => record['archived'] === true)
    assert.equal(col.isDisabledFor({ archived: true  }), true)
    assert.equal(col.isDisabledFor({ archived: false }), false)
  })

  it('isDisabledFor() fails closed (disabled) when the predicate throws', () => {
    const col = TextInputColumn.make('x').disabled(() => { throw new Error('boom') })
    assert.equal(col.isDisabledFor({}), true)
  })

  it('rules serialize to the meta only on editable columns', () => {
    const editable = TextInputColumn.make('x').required().toMeta()
    assert.deepEqual(editable.rules, [{ rule: 'required', message: 'This field is required' }])
    // Read-only columns also accept .required() but don't emit rules.
    const readonly = Column.make('x').required().toMeta()
    assert.equal(readonly.rules, undefined)
  })
})

describe('TextInputColumn', () => {
  it('defaults columnType=textInput, type=text, omits debounce', () => {
    const meta = TextInputColumn.make('title').toMeta()
    assert.equal(meta.columnType, 'textInput')
    assert.equal(meta.inputType, undefined)        // 'text' is default; omitted
    assert.equal(meta.debounceMs, undefined)
  })

  it('round-trips type/placeholder/step/min/max/debounce', () => {
    const meta = TextInputColumn.make('price')
      .type('number')
      .placeholder('0.00')
      .step(0.01)
      .min(0)
      .max(9999)
      .debounce(750)
      .toMeta()
    assert.equal(meta.inputType, 'number')
    assert.equal(meta.inputPlaceholder, '0.00')
    assert.equal(meta.inputStep, 0.01)
    assert.equal(meta.inputMin, 0)
    assert.equal(meta.inputMax, 9999)
    assert.equal(meta.debounceMs, 750)
  })

  it('inherits base chrome (label, alignment, width)', () => {
    const meta = TextInputColumn.make('x')
      .label('My field')
      .alignment('end')
      .width('120px')
      .toMeta()
    assert.equal(meta.label, 'My field')
    assert.equal(meta.alignment, 'end')
    assert.equal(meta.width, '120px')
  })
})

describe('ToggleColumn', () => {
  it('defaults columnType=toggle with no toggle-specific extras', () => {
    const meta = ToggleColumn.make('featured').toMeta()
    assert.equal(meta.columnType, 'toggle')
    assert.equal(meta.toggleOnColor, undefined)
    assert.equal(meta.toggleOffColor, undefined)
    assert.equal(meta.toggleOnIcon, undefined)
    assert.equal(meta.toggleOffIcon, undefined)
  })

  it('round-trips on/off color and icon', () => {
    const meta = ToggleColumn.make('featured')
      .onColor('success')
      .offColor('muted')
      .onIcon('star')
      .offIcon('star-off')
      .toMeta()
    assert.equal(meta.toggleOnColor, 'success')
    assert.equal(meta.toggleOffColor, 'muted')
    assert.equal(meta.toggleOnIcon, 'star')
    assert.equal(meta.toggleOffIcon, 'star-off')
  })
})

describe('SelectColumn', () => {
  it('options() accepts the map shorthand', () => {
    const meta = SelectColumn.make('status')
      .options({ draft: 'Draft', published: 'Published' })
      .toMeta()
    assert.equal(meta.columnType, 'select')
    assert.deepEqual(meta.selectOptions, [
      { value: 'draft',     label: 'Draft' },
      { value: 'published', label: 'Published' },
    ])
  })

  it('options() accepts the array form', () => {
    const meta = SelectColumn.make('status')
      .options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ])
      .toMeta()
    assert.deepEqual(meta.selectOptions, [
      { value: 'draft',     label: 'Draft' },
      { value: 'published', label: 'Published' },
    ])
  })

  it('options() replaces the prior set rather than merging', () => {
    const meta = SelectColumn.make('status')
      .options({ draft: 'Draft' })
      .options({ published: 'Published' })
      .toMeta()
    assert.deepEqual(meta.selectOptions, [{ value: 'published', label: 'Published' }])
  })

  it('nullable() and selectablePlaceholder(false) round-trip', () => {
    const meta = SelectColumn.make('status')
      .options({ draft: 'Draft' })
      .nullable()
      .selectablePlaceholder(false)
      .toMeta()
    assert.equal(meta.selectNullable, true)
    assert.equal(meta.selectablePlaceholder, false)
  })

  it('selectablePlaceholder defaults to omitted (renderer keeps showing it)', () => {
    const meta = SelectColumn.make('status').options({ a: 'A' }).toMeta()
    assert.equal(meta.selectablePlaceholder, undefined)
  })

  describe('options(record => …) per-row resolver', () => {
    it('stores the resolver and clears any prior static options', () => {
      const col = SelectColumn.make('assigneeId')
        .options({ a: 'Alice', b: 'Bob' })
        .options(_row => ({ x: 'X' }))
      assert.equal(col.getOptions().length, 0)
      assert.equal(typeof col.getOptionsResolver(), 'function')
    })

    it('switching back to a static list clears the resolver', () => {
      const col = SelectColumn.make('assigneeId')
        .options(_row => ({ x: 'X' }))
        .options({ a: 'Alice' })
      assert.equal(col.getOptionsResolver(), undefined)
      assert.deepEqual(col.getOptions().slice(), [{ value: 'a', label: 'Alice' }])
    })

    it('static options still serialize when only static is set', () => {
      const meta = SelectColumn.make('status').options({ a: 'A' }).toMeta()
      assert.deepEqual(meta.selectOptions, [{ value: 'a', label: 'A' }])
    })

    it('resolver-only column omits selectOptions from meta (per-row stamp wins)', () => {
      const meta = SelectColumn.make('assigneeId').options(_row => ({ x: 'X' })).toMeta()
      assert.equal(meta.selectOptions, undefined)
    })

    it('mixing a static fallback with a resolver — resolver wins, static stays in meta', () => {
      const col = SelectColumn.make('assigneeId')
        .options({ unknown: 'Unassigned' })
      // Re-assign as resolver — resolver wipes the static list per the
      // "re-calling replaces the previous set" contract. To keep the
      // static fallback, set the resolver first then add static.
      col.options(_row => ({ x: 'X' }))
      assert.equal(col.getOptions().length, 0)

      // The other ordering: static after resolver clears the resolver.
      const col2 = SelectColumn.make('assigneeId')
        .options(_row => ({ x: 'X' }))
        .options({ unknown: 'Unassigned' })
      assert.equal(col2.getOptionsResolver(), undefined)
      assert.deepEqual(col2.getOptions().slice(), [{ value: 'unknown', label: 'Unassigned' }])
    })
  })
})
