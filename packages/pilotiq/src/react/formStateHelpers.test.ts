import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { collectFieldDefaults, findFieldMeta } from './formStateHelpers.js'
import type { ElementMeta } from '../schema/Element.js'

const field = (name: string, defaultValue?: unknown): ElementMeta => ({
  type:      'field',
  fieldType: 'text',
  name,
  label:     name,
  required:  false,
  disabled:  false,
  ...(defaultValue !== undefined ? { defaultValue } : {}),
} as ElementMeta)

const formMeta = (children: ElementMeta[], values?: Record<string, unknown>): ElementMeta => ({
  type:    'form',
  formId:  'form-1',
  method:  'post',
  children,
  ...(values ? { values } : {}),
} as ElementMeta)

describe('collectFieldDefaults', () => {
  it('flattens top-level fields by name', () => {
    const meta = formMeta([
      field('title', 'Hello'),
      field('slug',  'hello'),
    ])
    const out = collectFieldDefaults(meta)
    assert.deepEqual(out, { title: 'Hello', slug: 'hello' })
  })

  it('walks into nested children', () => {
    const meta = formMeta([
      {
        type:     'section',
        children: [field('nested', 42)],
      } as ElementMeta,
    ])
    const out = collectFieldDefaults(meta)
    assert.deepEqual(out, { nested: 42 })
  })

  it('uses empty string for fields without defaultValue', () => {
    const out = collectFieldDefaults(formMeta([field('untouched')]))
    assert.equal(out['untouched'], '')
  })

  it('overlays form-level values on top of field defaults', () => {
    const meta = formMeta(
      [field('title', 'Default')],
      { title: 'From values', extra: 'extra' },
    )
    const out = collectFieldDefaults(meta)
    assert.equal(out['title'], 'From values')
    assert.equal(out['extra'], 'extra')
  })

  it('skips non-field nodes', () => {
    const meta = formMeta([
      { type: 'heading', text: 'Hello' } as ElementMeta,
      field('real', 'value'),
    ])
    const out = collectFieldDefaults(meta)
    assert.deepEqual(out, { real: 'value' })
  })
})

describe('findFieldMeta', () => {
  it('finds top-level field', () => {
    const target = field('title', 'Hello')
    const found  = findFieldMeta(formMeta([target, field('slug')]), 'title')
    assert.equal(found, target)
  })

  it('finds nested field', () => {
    const target = field('inner')
    const meta = formMeta([
      {
        type:     'section',
        children: [field('outer'), { type: 'card', children: [target] } as ElementMeta],
      } as ElementMeta,
    ])
    const found = findFieldMeta(meta, 'inner')
    assert.equal(found, target)
  })

  it('returns undefined for unknown name', () => {
    assert.equal(findFieldMeta(formMeta([field('a')]), 'b'), undefined)
  })

  it('first match wins when names collide', () => {
    const a = field('dup', 'first')
    const b = field('dup', 'second')
    const found = findFieldMeta(formMeta([a, b]), 'dup')
    assert.equal(found, a)
  })
})
