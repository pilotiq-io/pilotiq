import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextField } from '../fields/TextField.js'
import { EmailField } from '../fields/EmailField.js'
import { NumberField } from '../fields/NumberField.js'
import { Section } from '../schema/Section.js'
import { Card } from '../schema/Card.js'
import { Tabs, Tab } from '../schema/Tabs.js'

import { makeValidator } from './Validator.js'
import { required, email, minLength, maxLength, min, max, pattern } from './rules.js'
import { validateSchema, isValid } from './runValidators.js'

describe('built-in validators', () => {
  describe('required', () => {
    it('rejects empty string, null, and undefined', () => {
      const v = required()
      assert.equal(v(''),         'This field is required')
      assert.equal(v(null),       'This field is required')
      assert.equal(v(undefined),  'This field is required')
    })

    it('accepts non-empty values (including 0 and false)', () => {
      const v = required()
      assert.equal(v('hi'),  null)
      assert.equal(v(0),     null)
      assert.equal(v(false), null)
    })

    it('honors a custom message', () => {
      assert.equal(required('Required!')(''), 'Required!')
    })

    it('serializes to { rule: "required", message }', () => {
      assert.deepEqual(required().serialized, { rule: 'required', message: 'This field is required' })
    })
  })

  describe('email', () => {
    it('passes empty values (combine with required for "must have an email")', () => {
      assert.equal(email()(''),        null)
      assert.equal(email()(undefined), null)
    })

    it('rejects malformed emails', () => {
      assert.equal(email()('not-an-email'), 'Must be a valid email')
      assert.equal(email()('a@b'),          'Must be a valid email')
      assert.equal(email()('a@.com'),       'Must be a valid email')
    })

    it('accepts well-formed emails', () => {
      assert.equal(email()('user@example.com'), null)
    })
  })

  describe('minLength / maxLength', () => {
    it('minLength rejects shorter strings, accepts equal/longer', () => {
      const v = minLength(3)
      assert.equal(v('ab'),  'Must be at least 3 characters')
      assert.equal(v('abc'), null)
      assert.equal(v('abcd'),null)
    })

    it('maxLength rejects longer strings', () => {
      const v = maxLength(3)
      assert.equal(v('abcd'), 'Must be at most 3 characters')
      assert.equal(v('abc'),  null)
    })

    it('skips non-strings and empty values', () => {
      assert.equal(minLength(3)(undefined), null)
      assert.equal(minLength(3)(42),        null)
    })
  })

  describe('min / max', () => {
    it('min/max bound numbers', () => {
      assert.equal(min(0)(-1),    'Must be at least 0')
      assert.equal(min(0)(0),     null)
      assert.equal(max(10)(11),   'Must be at most 10')
      assert.equal(max(10)(10),   null)
    })

    it('skips non-numbers and empty', () => {
      assert.equal(min(0)('hi'),      null)
      assert.equal(min(0)(undefined), null)
    })
  })

  describe('pattern', () => {
    it('rejects non-matching strings', () => {
      assert.equal(pattern(/^[a-z]+$/)('Abc'), 'Invalid format')
      assert.equal(pattern(/^[a-z]+$/)('abc'), null)
    })

    it('serializes source + flags', () => {
      const re = /^foo$/i
      assert.deepEqual(pattern(re).serialized, {
        rule: 'pattern', source: '^foo$', flags: 'i', message: 'Invalid format',
      })
    })
  })

  describe('makeValidator', () => {
    it('produces a callable validator without serialized when none provided', () => {
      const v = makeValidator(val => (val === 'bad' ? 'no' : null))
      assert.equal(v('bad'), 'no')
      assert.equal(v('ok'),  null)
      assert.equal(v.serialized, undefined)
    })
  })
})

describe('Field.validate / runValidators', () => {
  it('accumulates validators across calls', async () => {
    const f = TextField.make('x').validate(minLength(3)).validate(maxLength(5))
    assert.equal((await f.runValidators('a')).length,     1) // minLength
    assert.equal((await f.runValidators('abcdef')).length, 1) // maxLength
    assert.equal((await f.runValidators('abcd')).length,  0)
  })

  it('reports every error, not just the first', async () => {
    const f = EmailField.make('x').validate([minLength(20), email()])
    const errors = await f.runValidators('a@b')
    assert.equal(errors.length, 2)
  })

  it('honors validator order', async () => {
    const f = TextField.make('x').validate([minLength(5), maxLength(2)])
    const errors = await f.runValidators('abc')
    // both fail; order is [minLength, maxLength]
    assert.match(errors[0]!, /at least 5/)
    assert.match(errors[1]!, /at most 2/)
  })

  it('passes ctx through to validators', async () => {
    const seenValues: unknown[] = []
    const v = makeValidator((_value, ctx) => {
      seenValues.push(ctx?.values)
      return null
    })
    const f = TextField.make('x').validate(v)
    await f.runValidators('a', { values: { other: 1 } })
    assert.deepEqual(seenValues, [{ other: 1 }])
  })

  it('required() flag implicitly adds a required check', async () => {
    const f = TextField.make('x').required()
    assert.deepEqual(await f.runValidators(''), ['This field is required'])
    assert.deepEqual(await f.runValidators('ok'), [])
  })

  it('does not double-fire required when both flag and validator are set', async () => {
    const f = TextField.make('x').required().validate(required('Custom required'))
    const errors = await f.runValidators('')
    assert.equal(errors.length, 1)
    assert.equal(errors[0], 'Custom required')
  })

  it('awaits async validators in declaration order', async () => {
    const seen: string[] = []
    const slow = makeValidator(async _v => {
      await new Promise(r => setTimeout(r, 5))
      seen.push('slow')
      return 'slow-error'
    })
    const fast = makeValidator(_v => { seen.push('fast'); return 'fast-error' })
    const f = TextField.make('x').validate([slow, fast])
    const errors = await f.runValidators('hi')
    assert.deepEqual(seen, ['slow', 'fast'])
    assert.deepEqual(errors, ['slow-error', 'fast-error'])
  })
})

describe('Field.toMeta serialized rules', () => {
  it('omits rules array when no validators and not required', () => {
    const meta = TextField.make('x').toMeta()
    assert.equal('rules' in meta, false)
  })

  it('includes a required rule when .required() is set', () => {
    const meta = TextField.make('x').required().toMeta()
    assert.deepEqual(meta.rules, [{ rule: 'required', message: 'This field is required' }])
  })

  it('serializes each validator that carries a descriptor', () => {
    const meta = EmailField.make('x').validate([email(), minLength(5)]).toMeta()
    assert.deepEqual(meta.rules, [
      { rule: 'email',     message: 'Must be a valid email' },
      { rule: 'minLength', value: 5, message: 'Must be at least 5 characters' },
    ])
  })

  it('skips validators without a serialized descriptor', () => {
    const customOnly = makeValidator(() => null) // no serialized
    const meta = TextField.make('x').validate(customOnly).toMeta()
    assert.equal('rules' in meta, false)
  })

  it('does not duplicate required when both flag and validator are set', () => {
    const meta = TextField.make('x').required().validate(required('Custom required')).toMeta()
    assert.equal(meta.rules!.length, 1)
    assert.equal((meta.rules![0] as { message: string }).message, 'Custom required')
  })
})

describe('validateSchema (tree-level runner)', () => {
  it('walks containers and gathers errors keyed by field name', async () => {
    const schema = [
      Section.make('Profile').schema([
        TextField.make('name').required(),
        EmailField.make('email').validate(email()),
      ]),
      Card.make().schema([
        NumberField.make('age').validate(min(0)),
      ]),
    ]
    const errors = await validateSchema(schema, { name: '', email: 'bad', age: -1 })
    assert.deepEqual(errors['name'],  ['This field is required'])
    assert.deepEqual(errors['email'], ['Must be a valid email'])
    assert.deepEqual(errors['age'],   ['Must be at least 0'])
    assert.equal(isValid(errors), false)
  })

  it('walks deeply-nested Tabs/Tab containers', async () => {
    const schema = [
      Tabs.make().tabs([
        Tab.make('Settings').schema([
          TextField.make('alias').required(),
        ]),
      ]),
    ]
    const errors = await validateSchema(schema, { alias: '' })
    assert.deepEqual(errors['alias'], ['This field is required'])
  })

  it('returns empty map and isValid=true when everything passes', async () => {
    const schema = [TextField.make('a').required(), TextField.make('b')]
    const errors = await validateSchema(schema, { a: 'hello', b: undefined })
    assert.deepEqual(errors, {})
    assert.equal(isValid(errors), true)
  })

  it('passes record through to validator ctx', async () => {
    let captured: unknown
    const v = makeValidator((_value, ctx) => { captured = ctx?.record; return null })
    const schema = [TextField.make('x').validate(v)]
    await validateSchema(schema, { x: 'hi' }, { id: 42 })
    assert.deepEqual(captured, { id: 42 })
  })

  it('readonly fields still validate', async () => {
    const schema = [TextField.make('x').readonly().required()]
    const errors = await validateSchema(schema, { x: '' })
    assert.deepEqual(errors['x'], ['This field is required'])
  })

  it('awaits async field validators', async () => {
    const v = makeValidator(async _v => {
      await new Promise(r => setTimeout(r, 1))
      return 'async-error'
    })
    const schema = [TextField.make('x').validate(v)]
    const errors = await validateSchema(schema, { x: 'hi' })
    assert.deepEqual(errors['x'], ['async-error'])
  })
})
