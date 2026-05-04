import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectFieldDefaults,
  findFieldMeta,
  parseFormDataToNested,
  readNestedValue,
  writeNestedValue,
} from './formStateHelpers.js'
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

// ─── Plan #14 — dotted-path live for inner Repeater fields ─────────

const repeater = (
  name:     string,
  rows:     ElementMeta[][],
  template: ElementMeta[] = [],
): ElementMeta => ({
  type:      'field',
  fieldType: 'repeater',
  name,
  label:     name,
  required:  false,
  disabled:  false,
  rows:      rows.map((children, i) => ({ id: `r${i}`, children })),
  template,
} as ElementMeta)

describe('findFieldMeta — dotted paths into Repeater rows', () => {
  it('finds an inner Repeater field by dotted path', () => {
    const inner = field('product')
    ;(inner as Record<string, unknown>)['live'] = true
    const meta  = formMeta([repeater('items', [[inner, field('qty')]])])
    const found = findFieldMeta(meta, 'items.0.product')
    assert.equal(found?.['name'], 'product')
    assert.equal(found?.['live'], true)
  })

  it('uses the requested row index when present', () => {
    const r0 = field('product')
    const r1 = field('product')
    ;(r1 as Record<string, unknown>)['live'] = { debounce: 200 }
    const meta = formMeta([repeater('items', [[r0], [r1]])])
    assert.deepEqual(findFieldMeta(meta, 'items.1.product')?.['live'], { debounce: 200 })
  })

  it('falls back to row 0 when index is out of range', () => {
    const inner = field('product')
    ;(inner as Record<string, unknown>)['live'] = true
    const meta  = formMeta([repeater('items', [[inner]])])
    assert.equal(findFieldMeta(meta, 'items.7.product')?.['live'], true)
  })

  it('falls back to template when no rows are present', () => {
    const tpl = field('product')
    ;(tpl as Record<string, unknown>)['live'] = true
    const meta = formMeta([repeater('items', [], [tpl])])
    assert.equal(findFieldMeta(meta, 'items.0.product')?.['live'], true)
  })

  it('returns undefined when first segment is not a Repeater', () => {
    const meta = formMeta([field('title')])
    assert.equal(findFieldMeta(meta, 'title.0.x'), undefined)
  })

  it('handles nested Repeaters', () => {
    const inner = field('name')
    ;(inner as Record<string, unknown>)['live'] = true
    const mods  = repeater('modifiers', [[inner]])
    const meta  = formMeta([repeater('items', [[field('product'), mods]])])
    const found = findFieldMeta(meta, 'items.0.modifiers.0.name')
    assert.equal(found?.['name'], 'name')
    assert.equal(found?.['live'], true)
  })
})

describe('parseFormDataToNested', () => {
  function fdFrom(entries: Array<[string, string]>): FormData {
    const fd = new FormData()
    for (const [k, v] of entries) fd.append(k, v)
    return fd
  }

  it('flat keys round-trip as flat object', () => {
    const fd = fdFrom([['title', 'Hello'], ['body', 'World']])
    assert.deepEqual(parseFormDataToNested(fd), { title: 'Hello', body: 'World' })
  })

  it('dotted keys with numeric segments build arrays of objects', () => {
    const fd = fdFrom([
      ['items.0.product', 'A'],
      ['items.0.qty',     '2'],
      ['items.1.product', 'B'],
      ['items.1.qty',     '5'],
    ])
    assert.deepEqual(parseFormDataToNested(fd), {
      items: [
        { product: 'A', qty: '2' },
        { product: 'B', qty: '5' },
      ],
    })
  })

  it('handles nested Repeaters', () => {
    const fd = fdFrom([
      ['items.0.product',          'A'],
      ['items.0.modifiers.0.name', 'No onions'],
      ['items.0.modifiers.1.name', 'Extra cheese'],
    ])
    assert.deepEqual(parseFormDataToNested(fd), {
      items: [{
        product:   'A',
        modifiers: [{ name: 'No onions' }, { name: 'Extra cheese' }],
      }],
    })
  })

  it('filters out _formId and _method transport keys', () => {
    const fd = fdFrom([
      ['_formId', 'my-form'],
      ['_method', 'patch'],
      ['title',   'Hello'],
    ])
    assert.deepEqual(parseFormDataToNested(fd), { title: 'Hello' })
  })

  it('filters out Repeater __id row-identity keys', () => {
    const fd = fdFrom([
      ['items.0.__id',    'row-abc'],
      ['items.0.product', 'A'],
    ])
    assert.deepEqual(parseFormDataToNested(fd), {
      items: [{ product: 'A' }],
    })
  })

  it('last value wins for duplicate keys', () => {
    const fd = fdFrom([['title', 'first'], ['title', 'second']])
    assert.deepEqual(parseFormDataToNested(fd), { title: 'second' })
  })
})

describe('writeNestedValue', () => {
  it('writes a flat key', () => {
    const root: Record<string, unknown> = {}
    writeNestedValue(root, 'title', 'Hello')
    assert.deepEqual(root, { title: 'Hello' })
  })

  it('writes a dotted path into a fresh nested structure', () => {
    const root: Record<string, unknown> = {}
    writeNestedValue(root, 'items.0.product', 'A')
    assert.deepEqual(root, { items: [{ product: 'A' }] })
  })

  it('overwrites an existing nested value without disturbing siblings', () => {
    const root: Record<string, unknown> = {
      items: [{ product: 'OLD', qty: '2' }, { product: 'B' }],
    }
    writeNestedValue(root, 'items.0.product', 'NEW')
    assert.deepEqual(root, {
      items: [{ product: 'NEW', qty: '2' }, { product: 'B' }],
    })
  })

  it('extends an array when index is past the end', () => {
    const root: Record<string, unknown> = { items: [{ product: 'A' }] }
    writeNestedValue(root, 'items.2.product', 'C')
    const items = (root['items'] as unknown[])
    assert.equal(items.length, 3)
    assert.deepEqual(items[2], { product: 'C' })
  })
})

describe('readNestedValue', () => {
  it('reads a flat key', () => {
    assert.equal(readNestedValue({ title: 'Hi' }, 'title'), 'Hi')
  })

  it('reads a dotted path into an array of objects', () => {
    const root = { items: [{ product: 'A' }, { product: 'B' }] }
    assert.equal(readNestedValue(root, 'items.0.product'), 'A')
    assert.equal(readNestedValue(root, 'items.1.product'), 'B')
  })

  it('returns undefined when an intermediate segment is missing', () => {
    assert.equal(readNestedValue({}, 'a.b.c'), undefined)
  })

  it('returns undefined when an array index is non-integer', () => {
    const root = { items: [{ x: 1 }] }
    assert.equal(readNestedValue(root, 'items.foo.x'), undefined)
  })

  it('returns undefined when an intermediate value is not navigable', () => {
    const root = { name: 'literal' }
    assert.equal(readNestedValue(root as Record<string, unknown>, 'name.length'), undefined)
  })
})
