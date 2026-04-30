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
