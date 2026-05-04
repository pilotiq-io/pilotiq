import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readBlockFieldValue } from './BlockSidePanel.js'
import { BlockNodeExtension } from '../extensions/BlockNodeExtension.js'

describe('readBlockFieldValue', () => {
  it('passes strings through for text fields', () => {
    const target = { type: 'text', value: 'hello world' }
    const result = readBlockFieldValue(target, { fieldType: 'text' })
    assert.equal(result, 'hello world')
  })

  it('passes strings through for textarea fields', () => {
    const target = { type: 'textarea', value: 'multi\nline' }
    const result = readBlockFieldValue(target, { fieldType: 'textarea' })
    assert.equal(result, 'multi\nline')
  })

  it('treats toggle as a boolean from `checked`', () => {
    assert.equal(readBlockFieldValue({ value: 'on', checked: true }, { fieldType: 'toggle' }), true)
    assert.equal(readBlockFieldValue({ value: 'off', checked: false }, { fieldType: 'toggle' }), false)
  })

  it('treats checkbox as a boolean from `checked`', () => {
    assert.equal(readBlockFieldValue({ value: 'on', checked: true }, { fieldType: 'checkbox' }), true)
    assert.equal(readBlockFieldValue({ value: 'off', checked: false }, { fieldType: 'checkbox' }), false)
  })

  it('coerces number fields to a Number, null when empty', () => {
    assert.equal(readBlockFieldValue({ value: '42', type: 'number' }, { fieldType: 'number' }), 42)
    assert.equal(readBlockFieldValue({ value: '3.14', type: 'number' }, { fieldType: 'number' }), 3.14)
    assert.equal(readBlockFieldValue({ value: '', type: 'number' }, { fieldType: 'number' }), null)
  })

  it('keeps slider values as Number too', () => {
    assert.equal(readBlockFieldValue({ value: '7' }, { fieldType: 'slider' }), 7)
  })

  it('falls back to raw string when number parse fails (NaN guard)', () => {
    // Browsers normally clamp invalid numeric input to '', but defensively
    // we must not silently emit NaN — round-trips into `JSON.stringify`
    // become `null`, and the next reload would lose the value.
    assert.equal(readBlockFieldValue({ value: 'abc' }, { fieldType: 'number' }), 'abc')
  })

  it('treats unknown fieldTypes as plain string', () => {
    assert.equal(readBlockFieldValue({ value: 'whatever' }, { fieldType: 'futuristic' }), 'whatever')
    assert.equal(readBlockFieldValue({ value: 'no type' }, {}), 'no type')
  })
})

describe('BlockNodeExtension options', () => {
  it('defaults onEdit to undefined when not configured', () => {
    const ext = BlockNodeExtension
    // `addOptions` returns the defaults; not exercising the full Tiptap
    // configure pipeline here because that requires a live editor.
    const defaults = ext.config.addOptions?.call({ name: 'pilotiqBlock', parent: undefined })
    assert.deepEqual(defaults, { blocks: [] })
    assert.equal((defaults as { onEdit?: unknown } | undefined)?.onEdit, undefined)
  })

  it('configure({ onEdit }) round-trips through Tiptap options', () => {
    const seen: number[] = []
    const onEdit = (p: number): void => { seen.push(p) }
    const configured = BlockNodeExtension.configure({ blocks: [], onEdit })
    // Tiptap stores configured options on `.options` after configure().
    const opts = configured.options as { blocks: unknown[]; onEdit?: (p: number) => void }
    assert.equal(typeof opts.onEdit, 'function')
    opts.onEdit?.(5)
    opts.onEdit?.(11)
    assert.deepEqual(seen, [5, 11])
  })

  it('configure without onEdit leaves it undefined', () => {
    const configured = BlockNodeExtension.configure({ blocks: [] })
    const opts = configured.options as { blocks: unknown[]; onEdit?: (p: number) => void }
    assert.equal(opts.onEdit, undefined)
  })
})
