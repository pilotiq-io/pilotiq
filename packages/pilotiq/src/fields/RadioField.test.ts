import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { RadioField, Radio } from './RadioField.js'

describe('RadioField', () => {
  it('emits fieldType "radio"', async () => {
    const meta = await RadioField.make('plan').toMeta()
    assert.equal(meta.fieldType, 'radio')
  })

  it('exports an alias `Radio`', () => {
    assert.equal(Radio, RadioField)
  })

  describe('options(static array)', () => {
    it('emits options array verbatim', async () => {
      const meta = await RadioField.make('plan').options([
        { value: 'free', label: 'Free' },
        { value: 'pro',  label: 'Pro' },
      ]).toMeta()
      assert.deepEqual(meta['options'], [
        { value: 'free', label: 'Free' },
        { value: 'pro',  label: 'Pro' },
      ])
    })

    it('hasDynamicOptions is false for static arrays', () => {
      const f = RadioField.make('plan').options([{ value: 'a', label: 'A' }])
      assert.equal(f.hasDynamicOptions(), false)
    })

    it('getOptions returns the array', () => {
      const f = RadioField.make('plan').options([{ value: 'a', label: 'A' }])
      assert.deepEqual(f.getOptions(), [{ value: 'a', label: 'A' }])
    })
  })

  describe('inline()', () => {
    it('default is vertical (no inline flag emitted)', async () => {
      const meta = await RadioField.make('x').toMeta()
      assert.equal('inline' in meta, false)
    })

    it('inline() emits inline:true', async () => {
      const meta = await RadioField.make('x').inline().toMeta()
      assert.equal(meta['inline'], true)
    })

    it('inline(false) does not emit the flag', async () => {
      const meta = await RadioField.make('x').inline(false).toMeta()
      assert.equal('inline' in meta, false)
    })
  })

  describe('options(resolver function)', () => {
    it('runs the resolver against ctx', async () => {
      const f = RadioField.make('state').options(({ $get }) => {
        const country = $get?.('country') as string | undefined
        if (country === 'US') return [{ value: 'CA', label: 'California' }]
        return [{ value: 'NA', label: 'N/A' }]
      })
      assert.equal(f.hasDynamicOptions(), true)
      const us = await f.toMeta({
        values: { country: 'US' },
        $get:   (n) => ({ country: 'US' } as Record<string, unknown>)[n],
      })
      assert.deepEqual(us['options'], [{ value: 'CA', label: 'California' }])
    })

    it('async resolver is awaited', async () => {
      const f = RadioField.make('items').options(async () => {
        await new Promise(r => setTimeout(r, 1))
        return [{ value: 'a', label: 'A' }]
      })
      const meta = await f.toMeta()
      assert.deepEqual(meta['options'], [{ value: 'a', label: 'A' }])
    })

    it('thrown resolver returns empty options + console.warn', async () => {
      const original = console.warn
      const calls: unknown[] = []
      console.warn = (...args: unknown[]) => { calls.push(args) }
      try {
        const f = RadioField.make('broken').options(() => { throw new Error('boom') })
        const meta = await f.toMeta()
        assert.deepEqual(meta['options'], [])
        assert.equal(calls.length, 1)
      } finally {
        console.warn = original
      }
    })
  })
})
