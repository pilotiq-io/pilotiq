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

    it('SelectField emits options array', async () => {
      const meta = await SelectField.make('status').options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ]).toMeta()
      assert.deepEqual(meta['options'], [
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
      ])
    })

    it('SelectField with options(fn) resolves dependent options against ctx', async () => {
      const f = SelectField.make('state').options(({ $get }) => {
        const country = $get?.('country') as string | undefined
        if (country === 'US') return [{ value: 'CA', label: 'California' }]
        return []
      })
      assert.equal(f.hasDynamicOptions(), true)
      const us = await f.toMeta({ values: { country: 'US' }, $get: (n) => ({ country: 'US' } as Record<string, unknown>)[n] })
      assert.deepEqual(us['options'], [{ value: 'CA', label: 'California' }])
      const empty = await f.toMeta({ values: { country: 'FR' }, $get: (n) => ({ country: 'FR' } as Record<string, unknown>)[n] })
      assert.deepEqual(empty['options'], [])
    })

    it('SelectField with async options(fn) awaits the result', async () => {
      const f = SelectField.make('items').options(async () => {
        await new Promise(r => setTimeout(r, 1))
        return [{ value: 'a', label: 'A' }]
      })
      const meta = await f.toMeta()
      assert.deepEqual(meta['options'], [{ value: 'a', label: 'A' }])
    })

    it('SelectField with options(fn) that throws falls back to empty + warns', async () => {
      const original = console.warn
      const calls: unknown[] = []
      console.warn = (...args: unknown[]) => { calls.push(args) }
      try {
        const f = SelectField.make('broken').options(() => { throw new Error('boom') })
        const meta = await f.toMeta()
        assert.deepEqual(meta['options'], [])
        assert.equal(calls.length, 1)
      } finally {
        console.warn = original
      }
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
      assert.equal(f.isHiddenIn({ mode: 'table'  }), true)
      assert.equal(f.isHiddenIn({ mode: 'create' }), false)
      assert.equal(f.isHiddenIn({ mode: 'edit'   }), false)
      assert.equal(f.isHiddenIn({ mode: 'view'   }), false)
    })

    it('hideFromCreate hides only in create mode', () => {
      const f = TextField.make('x').hideFromCreate()
      assert.equal(f.isHiddenIn({ mode: 'create' }), true)
      assert.equal(f.isHiddenIn({ mode: 'edit'   }), false)
    })

    it('hideFromEdit hides only in edit mode', () => {
      const f = TextField.make('x').hideFromEdit()
      assert.equal(f.isHiddenIn({ mode: 'edit'   }), true)
      assert.equal(f.isHiddenIn({ mode: 'create' }), false)
    })

    it('hideFromView hides only in view mode', () => {
      const f = TextField.make('x').hideFromView()
      assert.equal(f.isHiddenIn({ mode: 'view'   }), true)
      assert.equal(f.isHiddenIn({ mode: 'edit'   }), false)
    })

    it('flags compose: a field can be hidden from multiple modes', () => {
      const f = TextField.make('x').hideFromTable().hideFromView()
      assert.equal(f.isHiddenIn({ mode: 'table'  }), true)
      assert.equal(f.isHiddenIn({ mode: 'view'   }), true)
      assert.equal(f.isHiddenIn({ mode: 'create' }), false)
    })

    it('no ctx → no mode-based hiding', () => {
      const f = TextField.make('x').hideFromTable()
      assert.equal(f.isHiddenIn(), false)
    })
  })

  describe('condition callbacks', () => {
    it('showWhen hides when callback returns false', () => {
      const f = TextField.make('x').showWhen(({ record }) => (record as { active: boolean }).active)
      assert.equal(f.isHiddenIn({ mode: 'edit', record: { active: true  } }), false)
      assert.equal(f.isHiddenIn({ mode: 'edit', record: { active: false } }), true)
    })

    it('hideWhen hides when callback returns true', () => {
      const f = TextField.make('x').hideWhen(({ record }) => (record as { archived: boolean }).archived)
      assert.equal(f.isHiddenIn({ mode: 'edit', record: { archived: false } }), false)
      assert.equal(f.isHiddenIn({ mode: 'edit', record: { archived: true  } }), true)
    })

    it('conditions are skipped when no record/values are provided', () => {
      const f = TextField.make('x').showWhen(() => false) // would always hide
      assert.equal(f.isHiddenIn({ mode: 'create' }), false) // nothing to look at → skipped
    })

    it('mode flag wins even when condition would show', () => {
      const f = TextField.make('x').hideFromTable().showWhen(() => true)
      assert.equal(f.isHiddenIn({ mode: 'table', record: { x: 1 } }), true)
    })

    it('condition callback receives values for reactive evaluation', () => {
      const f = TextField.make('shipping').hideWhen(({ values }) => !(values?.['hasShipping']))
      assert.equal(f.isHiddenIn({ mode: 'edit', values: { hasShipping: true  } }), false)
      assert.equal(f.isHiddenIn({ mode: 'edit', values: { hasShipping: false } }), true)
    })

    it('condition callback receives $get for sibling reads', () => {
      const f = TextField.make('state').showWhen(({ $get }) => $get?.('country') === 'US')
      const ctx = { mode: 'edit' as const, values: { country: 'US' }, $get: (n: string) => ({ country: 'US' } as Record<string, unknown>)[n] }
      assert.equal(f.isHiddenIn(ctx), false)
      const ctx2 = { mode: 'edit' as const, values: { country: 'FR' }, $get: (n: string) => ({ country: 'FR' } as Record<string, unknown>)[n] }
      assert.equal(f.isHiddenIn(ctx2), true)
    })
  })
})

describe('Field.isDisabledIn', () => {
  it('readonly() makes field disabled regardless of record', () => {
    const f = TextField.make('x').readonly()
    assert.equal(f.isDisabledIn(),                                true)
    assert.equal(f.isDisabledIn({ record: { archived: false } }), true)
  })

  it('disabledWhen evaluates against record', () => {
    const f = TextField.make('x').disabledWhen(({ record }) => (record as { locked: boolean }).locked)
    assert.equal(f.isDisabledIn({ record: { locked: false } }), false)
    assert.equal(f.isDisabledIn({ record: { locked: true  } }), true)
  })

  it('disabledWhen is skipped when no record/values are provided', () => {
    const f = TextField.make('x').disabledWhen(() => true)
    assert.equal(f.isDisabledIn(), false)
  })

  it('disabledWhen evaluates against values via $get', () => {
    const f = TextField.make('slug').disabledWhen(({ $get }) => $get?.('autoSlug') === true)
    const ctxOn  = { values: { autoSlug: true  }, $get: (n: string) => ({ autoSlug: true  } as Record<string, unknown>)[n] }
    const ctxOff = { values: { autoSlug: false }, $get: (n: string) => ({ autoSlug: false } as Record<string, unknown>)[n] }
    assert.equal(f.isDisabledIn(ctxOn),  true)
    assert.equal(f.isDisabledIn(ctxOff), false)
  })

  it('toMeta() emits disabled=true when disabledWhen evaluates true', () => {
    const f = TextField.make('x').disabledWhen(({ record }) => (record as { locked: boolean }).locked)
    assert.equal(f.toMeta({ record: { locked: true  } }).disabled, true)
    assert.equal(f.toMeta({ record: { locked: false } }).disabled, false)
  })
})

describe('Field.live (Plan #5)', () => {
  it('isLive() defaults to false', () => {
    assert.equal(TextField.make('x').isLive(), false)
  })

  it('live() with no args sets the bare-true flag', () => {
    const f = TextField.make('x').live()
    assert.equal(f.isLive(),         true)
    assert.equal(f.getLiveOptions(), true)
    assert.equal(f.toMeta().live,    true)
  })

  it('live({ onBlur: true }) stores the options object', () => {
    const f = TextField.make('x').live({ onBlur: true })
    assert.deepEqual(f.getLiveOptions(), { onBlur: true })
    assert.deepEqual(f.toMeta().live,    { onBlur: true })
  })

  it('live({ debounce: 500 }) stores the debounce option', () => {
    const f = TextField.make('x').live({ debounce: 500 })
    assert.deepEqual(f.getLiveOptions(), { debounce: 500 })
  })

  it('live({ onBlur: true, debounce: 500 }) composes both', () => {
    const f = TextField.make('x').live({ onBlur: true, debounce: 500 })
    assert.deepEqual(f.getLiveOptions(), { onBlur: true, debounce: 500 })
  })

  it('live(true) is equivalent to live() with no args', () => {
    const f = TextField.make('x').live(true)
    assert.equal(f.getLiveOptions(), true)
  })

  it('live(false) clears the flag', () => {
    const f = TextField.make('x').live().live(false)
    assert.equal(f.isLive(),               false)
    assert.equal(f.getLiveOptions(),       undefined)
    assert.equal(f.toMeta().live,          undefined)
  })

  it('toMeta() omits the live key when not live', () => {
    const meta = TextField.make('x').toMeta()
    assert.equal('live' in meta, false)
  })
})

describe('Field.afterStateUpdated (Plan #5)', () => {
  it('stores the handler reference', () => {
    const fn = () => {}
    const f = TextField.make('x').afterStateUpdated(fn)
    assert.equal(f.getAfterStateUpdated(), fn)
  })

  it('handler is undefined by default', () => {
    assert.equal(TextField.make('x').getAfterStateUpdated(), undefined)
  })

  it('handler is independent of live() — can be set without live', () => {
    const f = TextField.make('x').afterStateUpdated(() => {})
    assert.equal(f.isLive(),                       false)
    assert.notEqual(f.getAfterStateUpdated(),      undefined)
  })
})

describe('Field.afterStateUpdatedJs (Tier-2 follow-up to Plan #5)', () => {
  it('stores the raw string body', () => {
    const body = `$set('slug', String($state).toLowerCase())`
    const f = TextField.make('title').afterStateUpdatedJs(body)
    assert.equal(f.getAfterStateUpdatedJs(), body)
  })

  it('default is undefined', () => {
    assert.equal(TextField.make('x').getAfterStateUpdatedJs(), undefined)
  })

  it('toMeta emits afterStateUpdatedJs when set', () => {
    const body = `$set('total', Number($state) * 2)`
    const meta = NumberField.make('qty').afterStateUpdatedJs(body).toMeta()
    assert.equal(meta.afterStateUpdatedJs, body)
  })

  it('toMeta omits the key when unset', () => {
    const meta = TextField.make('x').toMeta()
    assert.equal('afterStateUpdatedJs' in meta, false)
  })

  it('empty string clears the flag', () => {
    const f = TextField.make('x').afterStateUpdatedJs(`$set('a', 1)`).afterStateUpdatedJs('')
    assert.equal(f.getAfterStateUpdatedJs(), undefined)
    assert.equal('afterStateUpdatedJs' in f.toMeta(), false)
  })

  it('is independent of live() — can be set without it', () => {
    const f = TextField.make('x').afterStateUpdatedJs(`$set('y', $state)`)
    assert.equal(f.isLive(), false)
    assert.notEqual(f.getAfterStateUpdatedJs(), undefined)
  })

  it('coexists with the server-side afterStateUpdated handler', () => {
    const fn = () => {}
    const body = `$set('y', $state)`
    const f = TextField.make('x').afterStateUpdated(fn).afterStateUpdatedJs(body)
    assert.equal(f.getAfterStateUpdated(),    fn)
    assert.equal(f.getAfterStateUpdatedJs(),  body)
    const meta = f.toMeta()
    assert.equal(meta.afterStateUpdatedJs, body)
  })
})

describe('Field cross-field plumbing (Plan #6)', () => {
  describe('prefix / suffix / helperText', () => {
    it('emits prefix as a plain string', () => {
      const meta = TextField.make('price').prefix('$').toMeta()
      assert.equal(meta.prefix, '$')
    })

    it('emits suffix as a plain string', () => {
      const meta = TextField.make('domain').suffix('.com').toMeta()
      assert.equal(meta.suffix, '.com')
    })

    it('emits prefix as an icon descriptor', () => {
      const meta = TextField.make('search').prefix({ icon: 'search' }).toMeta()
      assert.deepEqual(meta.prefix, { icon: 'search' })
    })

    it('emits helperText when set', () => {
      const meta = TextField.make('slug').helperText('Lowercase, hyphens only').toMeta()
      assert.equal(meta.helperText, 'Lowercase, hyphens only')
    })

    it('omits prefix / suffix / helperText when unset', () => {
      const meta = TextField.make('x').toMeta()
      assert.equal('prefix'     in meta, false)
      assert.equal('suffix'     in meta, false)
      assert.equal('helperText' in meta, false)
    })
  })

  describe('aboveLabel() / belowLabel()', () => {
    it('emits both captions when set', () => {
      const meta = TextField.make('email')
        .aboveLabel('Step 2 of 3')
        .belowLabel('We never share this')
        .toMeta()
      assert.equal(meta.aboveLabel, 'Step 2 of 3')
      assert.equal(meta.belowLabel, 'We never share this')
    })

    it('omits both keys when unset (sparse meta)', () => {
      const meta = TextField.make('x').toMeta()
      assert.equal('aboveLabel' in meta, false)
      assert.equal('belowLabel' in meta, false)
    })
  })

  describe('inlineLabel()', () => {
    it('emits inlineLabel=true on meta when set', () => {
      const meta = TextField.make('amount').inlineLabel().toMeta()
      assert.equal(meta.inlineLabel, true)
    })

    it('omits inlineLabel when unset', () => {
      const meta = TextField.make('amount').toMeta()
      assert.equal('inlineLabel' in meta, false)
    })

    it('inlineLabel(false) clears the flag', () => {
      const meta = TextField.make('amount').inlineLabel().inlineLabel(false).toMeta()
      assert.equal('inlineLabel' in meta, false)
    })

    it('reads RenderContext.inlineLabelDefault as a fallback when unset', () => {
      const meta = TextField.make('amount').toMeta({ inlineLabelDefault: true })
      assert.equal(meta.inlineLabel, true)
    })

    it('explicit inlineLabel(false) wins over RenderContext.inlineLabelDefault', () => {
      const meta = TextField.make('amount').inlineLabel(false).toMeta({ inlineLabelDefault: true })
      assert.equal('inlineLabel' in meta, false)
    })

    it('explicit inlineLabel(true) emits regardless of ctx', () => {
      const meta = TextField.make('amount').inlineLabel(true).toMeta({ inlineLabelDefault: false })
      assert.equal(meta.inlineLabel, true)
    })
  })

  describe('default()', () => {
    it('emits defaultValue on meta when set', () => {
      const meta = TextField.make('x').default('hello').toMeta()
      assert.equal(meta.defaultValue, 'hello')
    })

    it('emits defaultValue with non-string types untouched', () => {
      assert.equal(NumberField.make('n').default(42).toMeta().defaultValue,        42)
      assert.equal(ToggleField.make('b').default(true).toMeta().defaultValue,      true)
    })

    it('omits defaultValue when unset', () => {
      const meta = TextField.make('x').toMeta()
      assert.equal('defaultValue' in meta, false)
    })
  })

  describe('dehydrated()', () => {
    it('defaults to true', () => {
      assert.equal(TextField.make('x').isDehydrated(), true)
    })

    it('dehydrated(false) marks field for body-skip', () => {
      assert.equal(TextField.make('x').dehydrated(false).isDehydrated(), false)
    })

    it('dehydrated(true) restores default', () => {
      assert.equal(TextField.make('x').dehydrated(false).dehydrated(true).isDehydrated(), true)
    })
  })

  describe('formatStateUsing()', () => {
    it('emits formattedValue when value is in record', () => {
      const meta = TextField.make('price')
        .formatStateUsing(v => `$${Number(v).toFixed(2)}`)
        .toMeta({ record: { price: 12.5 } })
      assert.equal(meta.formattedValue, '$12.50')
    })

    it('prefers values map over record', () => {
      const meta = TextField.make('price')
        .formatStateUsing(v => `$${v}`)
        .toMeta({ record: { price: 1 }, values: { price: 99 } })
      assert.equal(meta.formattedValue, '$99')
    })

    it('falls back to default() when neither record nor values supply the value', () => {
      const meta = TextField.make('price')
        .default(7)
        .formatStateUsing(v => `$${v}`)
        .toMeta()
      assert.equal(meta.formattedValue, '$7')
    })

    it('omits formattedValue when no source value is available', () => {
      const meta = TextField.make('price')
        .formatStateUsing(v => `$${v}`)
        .toMeta()
      assert.equal('formattedValue' in meta, false)
    })

    it('swallows thrown formatters with a warning + omits the key', () => {
      const original = console.warn
      const calls: unknown[] = []
      console.warn = (...args: unknown[]) => { calls.push(args) }
      try {
        const meta = TextField.make('x')
          .formatStateUsing(() => { throw new Error('boom') })
          .toMeta({ record: { x: 'something' } })
        assert.equal('formattedValue' in meta, false)
        assert.equal(calls.length, 1)
      } finally {
        console.warn = original
      }
    })
  })
})

describe('resolveField', () => {
  it('returns the meta when not hidden', async () => {
    const meta = await resolveField(TextField.make('title'), { mode: 'edit' })
    assert.ok(meta)
    assert.equal(meta!.name, 'title')
  })

  it('returns null when hidden by mode flag', async () => {
    const f = TextField.make('title').hideFromTable()
    assert.equal(await resolveField(f, { mode: 'table' }), null)
    assert.ok(await resolveField(f, { mode: 'edit' }))
  })

  it('returns null when hidden by showWhen', async () => {
    const f = TextField.make('title').showWhen(({ record }) => (record as { ok: boolean }).ok)
    assert.equal(await resolveField(f, { mode: 'edit', record: { ok: false } }), null)
    assert.ok(await resolveField(f, { mode: 'edit', record: { ok: true } }))
  })

  it('passes record through to toMeta() so disabledWhen evaluates', async () => {
    const f = TextField.make('x').disabledWhen(({ record }) => (record as { locked: boolean }).locked)
    const meta = await resolveField(f, { mode: 'edit', record: { locked: true } })
    assert.equal(meta!.disabled, true)
  })

  it('default context (no mode/record) skips all conditional logic', async () => {
    const f = TextField.make('x').hideFromTable().showWhen(() => false)
    const meta = await resolveField(f)
    assert.ok(meta)
    assert.equal(meta!.disabled, false)
  })
})

describe('resolveFields', () => {
  it('filters out hidden fields from the array', async () => {
    const fields = [
      TextField.make('a'),
      TextField.make('b').hideFromTable(),
      TextField.make('c'),
      TextField.make('d').hideFromTable(),
    ]
    const result = await resolveFields(fields, { mode: 'table' })
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(m => m.name), ['a', 'c'])
  })

  it('returns empty array when all fields are hidden', async () => {
    const fields = [TextField.make('a').hideFromTable(), TextField.make('b').hideFromTable()]
    const result = await resolveFields(fields, { mode: 'table' })
    assert.deepEqual(result, [])
  })

  it('preserves field order', async () => {
    const fields = [TextField.make('z'), TextField.make('a'), TextField.make('m')]
    const result = await resolveFields(fields)
    assert.deepEqual(result.map(m => m.name), ['z', 'a', 'm'])
  })
})

describe('Field Filament-parity additions', () => {
  describe('autofocus()', () => {
    it('omits autofocus when unset', () => {
      const meta = TextField.make('title').toMeta()
      assert.equal('autofocus' in meta, false)
    })

    it('emits autofocus: true when set', () => {
      const meta = TextField.make('title').autofocus().toMeta()
      assert.equal(meta.autofocus, true)
    })

    it('autofocus(false) clears the flag', () => {
      const meta = TextField.make('title').autofocus().autofocus(false).toMeta()
      assert.equal('autofocus' in meta, false)
    })
  })

  describe('hiddenLabel()', () => {
    it('omits hiddenLabel when unset', () => {
      const meta = TextField.make('title').toMeta()
      assert.equal('hiddenLabel' in meta, false)
    })

    it('emits hiddenLabel: true when set', () => {
      const meta = TextField.make('title').hiddenLabel().toMeta()
      assert.equal(meta.hiddenLabel, true)
    })
  })

  describe('validationAttribute()', () => {
    it('keeps the legacy generic message when unset', async () => {
      const errors = await TextField.make('email').required().runValidators('')
      assert.deepEqual(errors, ['This field is required'])
    })

    it('substitutes the attribute into the implicit-required message', async () => {
      const f = TextField.make('email').required().validationAttribute('email address')
      const errors = await f.runValidators('')
      assert.deepEqual(errors, ['The email address is required'])
    })

    it('mirrors the substituted message into FieldMeta.rules', () => {
      const meta = TextField.make('email').required().validationAttribute('email address').toMeta()
      assert.deepEqual(meta.rules, [{ rule: 'required', message: 'The email address is required' }])
    })
  })

  describe('extraAttributes / extraInputAttributes / extraFieldWrapperAttributes', () => {
    it('omits all three when unset', () => {
      const meta = TextField.make('title').toMeta()
      assert.equal('extraAttributes' in meta, false)
      assert.equal('extraInputAttributes' in meta, false)
      assert.equal('extraFieldWrapperAttributes' in meta, false)
    })

    it('emits each independently', () => {
      const meta = TextField.make('title')
        .extraAttributes({ 'data-cy': 'title' })
        .extraInputAttributes({ autocomplete: 'off' })
        .extraFieldWrapperAttributes({ 'data-section': 'header' })
        .toMeta()
      assert.deepEqual(meta.extraAttributes,             { 'data-cy': 'title' })
      assert.deepEqual(meta.extraInputAttributes,        { autocomplete: 'off' })
      assert.deepEqual(meta.extraFieldWrapperAttributes, { 'data-section': 'header' })
    })
  })

  describe('disabledOn / hiddenOn / visibleOn', () => {
    it('disabledOn flips disabled when ctx.mode matches', () => {
      const f = TextField.make('id').disabledOn(['edit'])
      assert.equal(f.isDisabledIn({ mode: 'create' }), false)
      assert.equal(f.isDisabledIn({ mode: 'edit' }),   true)
      assert.equal(f.isDisabledIn({ mode: 'view' }),   false)
    })

    it('disabledOn no-ops when mode is undefined (custom Page)', () => {
      const f = TextField.make('id').disabledOn(['edit'])
      assert.equal(f.isDisabledIn(), false)
    })

    it('hiddenOn flips visible when ctx.mode matches', () => {
      const f = TextField.make('admin').hiddenOn(['view'])
      assert.equal(f.isHiddenIn({ mode: 'create' }), false)
      assert.equal(f.isHiddenIn({ mode: 'view' }),   true)
    })

    it('visibleOn hides everywhere not listed', () => {
      const f = TextField.make('draft').visibleOn(['edit'])
      assert.equal(f.isHiddenIn({ mode: 'edit' }),   false)
      assert.equal(f.isHiddenIn({ mode: 'create' }), true)
      assert.equal(f.isHiddenIn({ mode: 'view' }),   true)
    })

    it('visibleOn keeps the field visible when mode is undefined', () => {
      const f = TextField.make('draft').visibleOn(['edit'])
      assert.equal(f.isHiddenIn(), false)
    })

    it('readonly() still wins over disabledOn', () => {
      const f = TextField.make('id').readonly().disabledOn(['create'])
      assert.equal(f.isDisabledIn({ mode: 'view' }), true)
    })
  })
})
