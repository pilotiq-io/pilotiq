import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ToggleButtonsField, ToggleButtons } from './ToggleButtonsField.js'

describe('ToggleButtonsField', () => {
  it('emits fieldType "toggleButtons"', async () => {
    const meta = await ToggleButtonsField.make('priority').toMeta()
    assert.equal(meta.fieldType, 'toggleButtons')
  })

  it('exports an alias `ToggleButtons`', () => {
    assert.equal(ToggleButtons, ToggleButtonsField)
  })

  it('does NOT emit an `inline` flag (chips are always horizontal)', async () => {
    const meta = await ToggleButtonsField.make('x').toMeta()
    assert.equal('inline' in meta, false)
  })

  describe('options(static array)', () => {
    it('emits options array verbatim', async () => {
      const meta = await ToggleButtonsField.make('priority').options([
        { value: 'low',  label: 'Low' },
        { value: 'high', label: 'High' },
      ]).toMeta()
      assert.deepEqual(meta['options'], [
        { value: 'low',  label: 'Low' },
        { value: 'high', label: 'High' },
      ])
    })

    it('hasDynamicOptions is false for static arrays', () => {
      const f = ToggleButtonsField.make('priority').options([{ value: 'a', label: 'A' }])
      assert.equal(f.hasDynamicOptions(), false)
    })

    it('getOptions returns the array', () => {
      const f = ToggleButtonsField.make('priority').options([{ value: 'a', label: 'A' }])
      assert.deepEqual(f.getOptions(), [{ value: 'a', label: 'A' }])
    })

    it('options default to [] when never configured', async () => {
      const meta = await ToggleButtonsField.make('x').toMeta()
      assert.deepEqual(meta['options'], [])
    })
  })

  describe('options(resolver function)', () => {
    it('runs the resolver against ctx', async () => {
      const f = ToggleButtonsField.make('plan').options(({ $get }) => {
        const tier = $get?.('tier') as string | undefined
        if (tier === 'pro') return [{ value: 'monthly', label: 'Monthly' }]
        return [{ value: 'free', label: 'Free' }]
      })
      assert.equal(f.hasDynamicOptions(), true)
      const meta = await f.toMeta({
        values: { tier: 'pro' },
        $get:   (n) => ({ tier: 'pro' } as Record<string, unknown>)[n],
      })
      assert.deepEqual(meta['options'], [{ value: 'monthly', label: 'Monthly' }])
    })

    it('async resolver is awaited', async () => {
      const f = ToggleButtonsField.make('items').options(async () => {
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
        const f = ToggleButtonsField.make('broken').options(() => { throw new Error('boom') })
        const meta = await f.toMeta()
        assert.deepEqual(meta['options'], [])
        assert.equal(calls.length, 1)
      } finally {
        console.warn = original
      }
    })
  })

  it('participates in cross-field plumbing (default / required / live)', async () => {
    const f = ToggleButtonsField.make('priority')
      .label('Priority')
      .required()
      .default('medium')
      .live()
      .options([
        { value: 'low',    label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high',   label: 'High' },
      ])
    const meta = await f.toMeta()
    assert.equal(meta.fieldType,    'toggleButtons')
    assert.equal(meta.required,     true)
    assert.equal(meta['defaultValue'], 'medium')
    assert.equal(meta['live'],      true)
    assert.equal(meta.label,        'Priority')
  })
})
