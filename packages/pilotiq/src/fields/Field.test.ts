import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextField } from './TextField.js'
import { NumberField } from './NumberField.js'
import { SelectField } from './SelectField.js'
import { TextareaField } from './TextareaField.js'
import { SlugField } from './SlugField.js'
import { EmailField } from './EmailField.js'
import { DateField } from './DateField.js'
import { ToggleField } from './ToggleField.js'
import { resolveField, resolveFields } from './resolveField.js'

describe('Field.toMeta', () => {
  describe('base properties (shared by all field types)', () => {
    it('emits fieldType, name, label, required, disabled', () => {
      const meta = TextField.make('title').required().toMeta()
      assert.equal(meta.fieldType, 'text')
      assert.equal(meta.name,      'title')
      assert.equal(meta.label,     'Title') // auto-derived from name
      assert.equal(meta.required,  true)
      assert.equal(meta.disabled,  false)
    })

    it('respects custom label override', () => {
      const meta = TextField.make('title').label('Article title').toMeta()
      assert.equal(meta.label, 'Article title')
    })

    it('emits placeholder when set', () => {
      const meta = TextField.make('title').placeholder('Type here...').toMeta()
      assert.equal(meta.placeholder, 'Type here...')
    })

    it('omits placeholder when unset', () => {
      const meta = TextField.make('title').toMeta()
      assert.equal('placeholder' in meta, false)
    })

    it('readonly() sets disabled=true in resolved meta', () => {
      const meta = TextField.make('title').readonly().toMeta()
      assert.equal(meta.disabled, true)
    })
  })

  describe('subtype-specific fields', () => {
    it('TextField emits maxLength when set', () => {
      const meta = TextField.make('title').maxLength(120).toMeta()
      assert.equal(meta['maxLength'], 120)
    })

    it('TextField omits maxLength when unset', () => {
      const meta = TextField.make('title').toMeta()
      assert.equal('maxLength' in meta, false)
    })

    it('NumberField emits min/max/step independently', () => {
      const meta = NumberField.make('age').min(0).max(120).step(1).toMeta()
      assert.equal(meta['min'],  0)
      assert.equal(meta['max'],  120)
      assert.equal(meta['step'], 1)
    })

    it('SelectField emits options array', () => {
      const meta = SelectField.make('status').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ]).toMeta()
      assert.deepEqual(meta['options'], [
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ])
    })

    it('TextareaField emits rows', () => {
      const meta = TextareaField.make('body').rows(8).toMeta()
      assert.equal(meta['rows'], 8)
    })

    it('SlugField emits from when configured', () => {
      const meta = SlugField.make('slug').from('title').toMeta()
      assert.equal(meta['from'], 'title')
    })

    it('EmailField/DateField/ToggleField inherit base shape (no extras)', () => {
      assert.equal(EmailField.make('email').toMeta().fieldType,    'email')
      assert.equal(DateField.make('publishedAt').toMeta().fieldType, 'date')
      assert.equal(ToggleField.make('featured').toMeta().fieldType, 'toggle')
    })
  })
})

describe('Field.isHiddenIn', () => {
  describe('mode flags', () => {
    it('hideFromTable hides only in table mode', () => {
      const f = TextField.make('x').hideFromTable()
      assert.equal(f.isHiddenIn('table'),  true)
      assert.equal(f.isHiddenIn('create'), false)
      assert.equal(f.isHiddenIn('edit'),   false)
      assert.equal(f.isHiddenIn('view'),   false)
    })

    it('hideFromCreate hides only in create mode', () => {
      const f = TextField.make('x').hideFromCreate()
      assert.equal(f.isHiddenIn('create'), true)
      assert.equal(f.isHiddenIn('edit'),   false)
    })

    it('hideFromEdit hides only in edit mode', () => {
      const f = TextField.make('x').hideFromEdit()
      assert.equal(f.isHiddenIn('edit'),   true)
      assert.equal(f.isHiddenIn('create'), false)
    })

    it('hideFromView hides only in view mode', () => {
      const f = TextField.make('x').hideFromView()
      assert.equal(f.isHiddenIn('view'),   true)
      assert.equal(f.isHiddenIn('edit'),   false)
    })

    it('flags compose: a field can be hidden from multiple modes', () => {
      const f = TextField.make('x').hideFromTable().hideFromView()
      assert.equal(f.isHiddenIn('table'),  true)
      assert.equal(f.isHiddenIn('view'),   true)
      assert.equal(f.isHiddenIn('create'), false)
    })

    it('mode is undefined → no mode-based hiding', () => {
      const f = TextField.make('x').hideFromTable()
      assert.equal(f.isHiddenIn(undefined), false)
    })
  })

  describe('condition callbacks', () => {
    it('showWhen hides when callback returns false', () => {
      const f = TextField.make('x').showWhen(r => (r as { active: boolean }).active)
      assert.equal(f.isHiddenIn('edit', { active: true }),  false)
      assert.equal(f.isHiddenIn('edit', { active: false }), true)
    })

    it('hideWhen hides when callback returns true', () => {
      const f = TextField.make('x').hideWhen(r => (r as { archived: boolean }).archived)
      assert.equal(f.isHiddenIn('edit', { archived: false }), false)
      assert.equal(f.isHiddenIn('edit', { archived: true }),  true)
    })

    it('conditions are skipped when no record is provided', () => {
      const f = TextField.make('x').showWhen(() => false) // would always hide
      assert.equal(f.isHiddenIn('create'), false) // no record → condition skipped
    })

    it('mode flag wins even when condition would show', () => {
      const f = TextField.make('x').hideFromTable().showWhen(() => true)
      assert.equal(f.isHiddenIn('table', { x: 1 }), true)
    })
  })
})

describe('Field.isDisabledIn', () => {
  it('readonly() makes field disabled regardless of record', () => {
    const f = TextField.make('x').readonly()
    assert.equal(f.isDisabledIn(undefined),       true)
    assert.equal(f.isDisabledIn({ archived: false }), true)
  })

  it('disabledWhen evaluates against record', () => {
    const f = TextField.make('x').disabledWhen(r => (r as { locked: boolean }).locked)
    assert.equal(f.isDisabledIn({ locked: false }), false)
    assert.equal(f.isDisabledIn({ locked: true }),  true)
  })

  it('disabledWhen is skipped when no record is provided', () => {
    const f = TextField.make('x').disabledWhen(() => true)
    assert.equal(f.isDisabledIn(undefined), false)
  })

  it('toMeta() emits disabled=true when disabledWhen evaluates true', () => {
    const f = TextField.make('x').disabledWhen(r => (r as { locked: boolean }).locked)
    assert.equal(f.toMeta({ locked: true }).disabled,  true)
    assert.equal(f.toMeta({ locked: false }).disabled, false)
  })
})

describe('resolveField', () => {
  it('returns the meta when not hidden', () => {
    const meta = resolveField(TextField.make('title'), { mode: 'edit' })
    assert.ok(meta)
    assert.equal(meta!.name, 'title')
  })

  it('returns null when hidden by mode flag', () => {
    const f = TextField.make('title').hideFromTable()
    assert.equal(resolveField(f, { mode: 'table' }),  null)
    assert.ok(resolveField(f, { mode: 'edit' }))
  })

  it('returns null when hidden by showWhen', () => {
    const f = TextField.make('title').showWhen(r => (r as { ok: boolean }).ok)
    assert.equal(resolveField(f, { mode: 'edit', record: { ok: false } }), null)
    assert.ok(resolveField(f, { mode: 'edit', record: { ok: true } }))
  })

  it('passes record through to toMeta() so disabledWhen evaluates', () => {
    const f = TextField.make('x').disabledWhen(r => (r as { locked: boolean }).locked)
    const meta = resolveField(f, { mode: 'edit', record: { locked: true } })
    assert.equal(meta!.disabled, true)
  })

  it('default context (no mode/record) skips all conditional logic', () => {
    const f = TextField.make('x').hideFromTable().showWhen(() => false)
    const meta = resolveField(f)
    assert.ok(meta)
    assert.equal(meta!.disabled, false)
  })
})

describe('resolveFields', () => {
  it('filters out hidden fields from the array', () => {
    const fields = [
      TextField.make('a'),
      TextField.make('b').hideFromTable(),
      TextField.make('c'),
      TextField.make('d').hideFromTable(),
    ]
    const result = resolveFields(fields, { mode: 'table' })
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(m => m.name), ['a', 'c'])
  })

  it('returns empty array when all fields are hidden', () => {
    const fields = [TextField.make('a').hideFromTable(), TextField.make('b').hideFromTable()]
    const result = resolveFields(fields, { mode: 'table' })
    assert.deepEqual(result, [])
  })

  it('preserves field order', () => {
    const fields = [TextField.make('z'), TextField.make('a'), TextField.make('m')]
    const result = resolveFields(fields)
    assert.deepEqual(result.map(m => m.name), ['z', 'a', 'm'])
  })
})
