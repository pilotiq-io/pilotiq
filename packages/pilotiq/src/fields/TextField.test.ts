import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TextField } from './TextField.js'
import { Action } from '../actions/Action.js'
import { resolveSchema } from '../schema/resolveSchema.js'
import { coerceFormValues } from '../elements/dispatchForm.js'
import { formatWithMask } from '../react/fields/textInputControls.js'

describe('TextField rich affordances (audit gap #3)', () => {
  describe('password / revealable', () => {
    it('emits password + revealable flags only when set', () => {
      const a = TextField.make('p').password().revealable().toMeta()
      assert.equal(a['password'],   true)
      assert.equal(a['revealable'], true)

      const b = TextField.make('p').toMeta()
      assert.equal(b['password'],   undefined)
      assert.equal(b['revealable'], undefined)
    })

    it('disarms with explicit false', () => {
      const a = TextField.make('p').password(false).toMeta()
      assert.equal(a['password'], undefined)
    })
  })

  describe('copyable', () => {
    it('flag emits and message defaults are sparse', () => {
      const a = TextField.make('x').copyable().toMeta()
      assert.equal(a['copyable'],     true)
      assert.equal(a['copyMessage'],  undefined)

      const b = TextField.make('x').copyable('Got it').toMeta()
      assert.equal(b['copyable'],     true)
      assert.equal(b['copyMessage'],  'Got it')
    })
  })

  describe('mask', () => {
    it('emits the pattern verbatim', () => {
      const a = TextField.make('phone').mask('(999) 999-9999').toMeta()
      assert.equal(a['mask'], '(999) 999-9999')
    })
  })

  describe('datalist', () => {
    it('emits a defensive copy of the values array', () => {
      const values = ['gmail.com', 'outlook.com']
      const a = TextField.make('email').datalist(values).toMeta()
      const out = a['datalist'] as string[]
      assert.deepEqual(out, values)
      // Mutating the original after the fact must not leak in.
      values.push('yahoo.com')
      assert.deepEqual(a['datalist'], ['gmail.com', 'outlook.com'])
    })
  })

  describe('stripCharacters', () => {
    it('accepts a string of single chars', () => {
      const a = TextField.make('phone').stripCharacters('()- ').toMeta()
      assert.deepEqual(a['stripCharacters'], ['(', ')', '-', ' '])
    })

    it('accepts an explicit array', () => {
      const a = TextField.make('phone').stripCharacters(['(', ')']).toMeta()
      assert.deepEqual(a['stripCharacters'], ['(', ')'])
    })

    it('omits when empty', () => {
      const a = TextField.make('x').stripCharacters('').toMeta()
      assert.equal(a['stripCharacters'], undefined)
    })

    it('strips configured chars during coerce', () => {
      const f = TextField.make('phone').stripCharacters('()- ')
      const out = coerceFormValues([f], { phone: '(415) 555-1212' })
      assert.equal(out['phone'], '4155551212')
    })

    it('coerce no-ops when not configured', () => {
      const f = TextField.make('plain')
      const out = coerceFormValues([f], { plain: 'a-b-c' })
      assert.equal(out['plain'], 'a-b-c')
    })

    it('coerce skips non-string values', () => {
      const f = TextField.make('plain').stripCharacters('-')
      const out = coerceFormValues([f], { plain: 42 as unknown as string })
      assert.equal(out['plain'], 42)
    })
  })

  describe('inputMode + autocapitalize', () => {
    it('emits each attribute when set', () => {
      const a = TextField.make('q').inputMode('search').autocapitalize('off').toMeta()
      assert.equal(a['inputMode'],      'search')
      assert.equal(a['autocapitalize'], 'off')
    })

    it('omits each attribute when unset', () => {
      const a = TextField.make('q').toMeta()
      assert.equal(a['inputMode'],      undefined)
      assert.equal(a['autocapitalize'], undefined)
    })
  })

  describe('prefixAction / suffixAction', () => {
    it('resolves bound Actions through resolveSchema as ActionMetas', async () => {
      const result = await resolveSchema([
        TextField.make('apiKey')
          .prefixAction(Action.make('generate').icon('plus'))
          .suffixAction(Action.make('rotate').icon('refresh')),
      ])
      const meta = result[0]!
      const pre = meta['prefixAction'] as Record<string, unknown> | undefined
      const suf = meta['suffixAction'] as Record<string, unknown> | undefined
      assert.equal(pre?.['type'], 'action')
      assert.equal(pre?.['name'], 'generate')
      assert.equal(suf?.['type'], 'action')
      assert.equal(suf?.['name'], 'rotate')
    })

    it('drops a hidden Action from the slot', async () => {
      const result = await resolveSchema([
        TextField.make('q').prefixAction(Action.make('hide').visible(false)),
      ])
      assert.equal(result[0]!['prefixAction'], undefined)
    })

    it('omits the slots when not configured', async () => {
      const result = await resolveSchema([TextField.make('q')])
      assert.equal(result[0]!['prefixAction'], undefined)
      assert.equal(result[0]!['suffixAction'], undefined)
    })
  })
})

describe('formatWithMask (client mask helper)', () => {
  it('formats a US phone via the documented alphabet', () => {
    assert.equal(formatWithMask('4155551212', '(999) 999-9999'), '(415) 555-1212')
  })

  it('emits literals even with no remaining input', () => {
    assert.equal(formatWithMask('415', '(999) 999-9999'), '(415) ')
  })

  it('skips characters that do not match the token kind', () => {
    assert.equal(formatWithMask('a4b1c5', '999'), '415')
  })

  it('handles alpha tokens', () => {
    assert.equal(formatWithMask('xy12', 'aa-99'), 'xy-12')
  })

  it('any-token (*) accepts any character', () => {
    assert.equal(formatWithMask('a1b2', '****'), 'a1b2')
  })

  it('does NOT double-emit literals already typed by the user', () => {
    assert.equal(formatWithMask('(415)5551212', '(999) 999-9999'), '(415) 555-1212')
  })

  it('returns input unchanged when mask is empty', () => {
    assert.equal(formatWithMask('hello', ''), '')
  })
})

