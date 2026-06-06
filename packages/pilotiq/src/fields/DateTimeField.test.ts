import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { DateField, DateTimePickerField, DateTimePicker } from './DateField.js'
import { coerceFormValues } from '../elements/dispatchForm.js'
import { formatWallClock, parseDateTimeWire, toDateTimeWire } from './dateTimeWire.js'

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

  it('naive datetime coerces as wall-clock UTC by default (no server-offset skew)', () => {
    const out = coerceFormValues(
      [DateTimePickerField.make('at')],
      { at: '2026-06-06T09:30' },
    )
    assert.equal((out['at'] as Date).toISOString(), '2026-06-06T09:30:00.000Z')
  })

  it('timezone() coerces wall-clock in the configured zone', () => {
    const out = coerceFormValues(
      [DateTimePickerField.make('at').timezone('Asia/Jerusalem')],
      { at: '2026-06-06T09:30' }, // IDT = UTC+3
    )
    assert.equal((out['at'] as Date).toISOString(), '2026-06-06T06:30:00.000Z')
  })
})

describe('DateField.timezone()', () => {
  it('emits sparse timezone meta', () => {
    const bare = DateTimePickerField.make('at').toMeta()
    assert.equal('timezone' in bare, false)
    const meta = DateTimePickerField.make('at').timezone('Asia/Jerusalem').toMeta()
    assert.equal(meta['timezone'], 'Asia/Jerusalem')
  })

  it('rejects unknown IANA names at config time', () => {
    assert.throws(
      () => DateField.make('at').timezone('Not/AZone'),
      /unknown IANA timezone 'Not\/AZone'/,
    )
  })
})

describe('dateTimeWire helpers', () => {
  it('format ↔ parse round-trips in UTC', () => {
    const d = new Date('2026-06-06T06:30:00.000Z')
    const wire = formatWallClock(d)
    assert.equal(wire, '2026-06-06T06:30')
    assert.equal(parseDateTimeWire(wire).getTime(), d.getTime())
  })

  it('format ↔ parse round-trips in a named zone', () => {
    const d = new Date('2026-06-06T06:30:00.000Z')
    const wire = formatWallClock(d, 'Asia/Jerusalem')
    assert.equal(wire, '2026-06-06T09:30')
    assert.equal(parseDateTimeWire(wire, 'Asia/Jerusalem').getTime(), d.getTime())
  })

  it('round-trips across a DST transition (America/New_York)', () => {
    // 2026-03-08 02:30 EST→EDT spring-forward day; pick a stable time after it.
    const d = new Date('2026-03-08T12:00:00.000Z')
    const wire = formatWallClock(d, 'America/New_York')
    assert.equal(wire, '2026-03-08T08:00') // EDT = UTC-4 after the jump
    assert.equal(parseDateTimeWire(wire, 'America/New_York').getTime(), d.getTime())
  })

  it('parse leaves zoned ISO strings alone', () => {
    const parsed = parseDateTimeWire('2026-06-06T09:30:00.000Z', 'Asia/Jerusalem')
    assert.equal(parsed.toISOString(), '2026-06-06T09:30:00.000Z')
  })

  it('parse leaves date-only strings at UTC midnight', () => {
    const parsed = parseDateTimeWire('2026-06-06', 'Asia/Jerusalem')
    assert.equal(parsed.toISOString(), '2026-06-06T00:00:00.000Z')
  })

  it('toDateTimeWire passes naive strings through without re-parsing', () => {
    // 422 re-render path: the raw body value is already wall-clock.
    assert.equal(toDateTimeWire('2026-06-06T09:30', 'Asia/Jerusalem'), '2026-06-06T09:30')
    assert.equal(toDateTimeWire('2026-06-06T09:30:45'), '2026-06-06T09:30')
  })

  it('toDateTimeWire formats Dates and zoned strings in the field zone', () => {
    assert.equal(
      toDateTimeWire(new Date('2026-06-06T06:30:00.000Z'), 'Asia/Jerusalem'),
      '2026-06-06T09:30',
    )
    assert.equal(
      toDateTimeWire('2026-06-06T06:30:00.000Z', 'Asia/Jerusalem'),
      '2026-06-06T09:30',
    )
    assert.equal(toDateTimeWire(undefined), undefined)
    assert.equal(toDateTimeWire('not-a-date'), undefined)
  })
})
