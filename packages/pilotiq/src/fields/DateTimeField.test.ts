import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DateField, DateTimePickerField, DateTimePicker } from './DateField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'

describe('DateField.withTime() (Plan #6)', () => {
  it('default DateField has no withTime flag', () => {
    const meta = DateField.make('publishedAt').toMeta()
    assert.equal('withTime' in meta, false)
    assert.equal(meta.fieldType, 'date')
  })

  it('withTime() sets the meta flag', () => {
    const f = DateField.make('publishedAt').withTime()
    assert.equal(f.hasTime(), true)
    const meta = f.toMeta()
    assert.equal(meta['withTime'], true)
  })

  it('withTime(false) clears the flag', () => {
    const meta = DateField.make('x').withTime().withTime(false).toMeta()
    assert.equal('withTime' in meta, false)
  })
})

describe('DateTimePickerField', () => {
  it('emits fieldType "dateTime" by default', () => {
    const meta = DateTimePickerField.make('scheduledAt').toMeta()
    assert.equal(meta.fieldType, 'dateTime')
    assert.equal(meta['withTime'], true)
  })

  it('exports an alias `DateTimePicker`', () => {
    assert.equal(DateTimePicker, DateTimePickerField)
  })

  it('coerces YYYY-MM-DDTHH:mm string → Date', () => {
    const out = coerceFormValues(
      [DateTimePickerField.make('at')],
      { at: '2026-05-01T14:30' },
    )
    assert.ok(out['at'] instanceof Date)
    const d = out['at'] as Date
    assert.equal(d.getUTCFullYear(), 2026)
  })

  it('empty string → null', () => {
    const out = coerceFormValues(
      [DateTimePickerField.make('at')],
      { at: '' },
    )
    assert.equal(out['at'], null)
  })
})
