import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectFieldDefaults,
  collectRowArrayFieldNames,
  fieldOptsOutOfCollab,
  findFieldMeta,
  parseFormDataToNested,
  parseRowFieldPath,
  readNestedValue,
  routeBindingWrite,
  rowIdAtIndex,
  writeNestedValue,
} from './formStateHelpers.js'
import type { ElementMeta } from '../schema/Element.js'
import type { FormCollabBinding } from './FormCollabBindingRegistry.js'

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

describe('parseRowFieldPath', () => {
  it('parses Repeater row leaves (3-segment dotted)', () => {
    assert.deepEqual(parseRowFieldPath('tags.0.label'), {
      arrayName: 'tags', index: 0, fieldName: 'label',
    })
  })

  it('parses Builder row leaves (4-segment with data wrapper)', () => {
    assert.deepEqual(parseRowFieldPath('blocks.0.data.body'), {
      arrayName: 'blocks', index: 0, fieldName: 'body',
    })
  })

  it('rejects top-level names', () => {
    assert.equal(parseRowFieldPath('title'), null)
  })

  it('rejects reserved row-metadata leaves (__id, type)', () => {
    assert.equal(parseRowFieldPath('tags.0.__id'), null)
    assert.equal(parseRowFieldPath('blocks.0.type'), null)
  })

  it('rejects non-integer indices', () => {
    assert.equal(parseRowFieldPath('tags.NaN.label'), null)
    assert.equal(parseRowFieldPath('tags.-1.label'), null)
  })

  it('rejects nested-Repeater paths (deferred to a future phase)', () => {
    assert.equal(parseRowFieldPath('articles.0.comments.1.body'), null)
  })

  it('rejects 4-segment paths that lack the literal "data" wrapper', () => {
    assert.equal(parseRowFieldPath('blocks.0.notdata.body'), null)
  })
})

describe('rowIdAtIndex', () => {
  it('reads the dotted __id at the given index', () => {
    const values = { 'tags.0.__id': 'row-abc', 'tags.0.label': 'a' }
    assert.equal(rowIdAtIndex(values, 'tags', 0), 'row-abc')
  })

  it('returns null when the row hasn\'t been stamped', () => {
    assert.equal(rowIdAtIndex({}, 'tags', 0), null)
  })

  it('returns null when __id is not a non-empty string', () => {
    assert.equal(rowIdAtIndex({ 'tags.0.__id': '' }, 'tags', 0), null)
    assert.equal(rowIdAtIndex({ 'tags.0.__id': 123 }, 'tags', 0), null)
  })
})

describe('collectRowArrayFieldNames', () => {
  const arrayField = (name: string, fieldType: 'repeater' | 'builder', collab?: boolean): ElementMeta => ({
    type:      'field',
    fieldType,
    name,
    label:     name,
    required:  false,
    disabled:  false,
    ...(collab === false ? { collab: false } : {}),
  } as ElementMeta)

  it('returns top-level Repeater and Builder field names', () => {
    const meta = formMeta([
      field('title'),
      arrayField('tags',   'repeater'),
      arrayField('blocks', 'builder'),
    ])
    assert.deepEqual(collectRowArrayFieldNames(meta), ['tags', 'blocks'])
  })

  it('walks into layout containers', () => {
    const meta = formMeta([
      {
        type:     'section',
        children: [arrayField('tags', 'repeater')],
      } as ElementMeta,
    ])
    assert.deepEqual(collectRowArrayFieldNames(meta), ['tags'])
  })

  it('skips fields opted out via .collab(false)', () => {
    const meta = formMeta([
      arrayField('private', 'repeater', false),
      arrayField('shared',  'repeater'),
    ])
    assert.deepEqual(collectRowArrayFieldNames(meta), ['shared'])
  })

  it('does not descend into inner row schemas', () => {
    const meta = formMeta([
      {
        ...arrayField('outer', 'repeater'),
        children: [arrayField('inner', 'repeater')],
      } as ElementMeta,
    ])
    assert.deepEqual(collectRowArrayFieldNames(meta), ['outer'])
  })
})

describe('routeBindingWrite', () => {
  interface RecordedCall {
    kind: 'set' | 'setRow' | 'addRow' | 'removeRow' | 'reorderRows'
    args: unknown[]
  }

  function stub(opts: { withSetRow?: boolean } = {}): { binding: FormCollabBinding; calls: RecordedCall[] } {
    const calls: RecordedCall[] = []
    const binding: FormCollabBinding = {
      get:       () => ({}),
      set:       (...args) => { calls.push({ kind: 'set',    args }) },
      subscribe: () => () => {},
      destroy:   () => {},
      ...(opts.withSetRow ? {
        setRow: (...args: unknown[]) => { calls.push({ kind: 'setRow', args }) },
      } : {}),
    } as FormCollabBinding
    return { binding, calls }
  }

  const formMetaWithRepeater = formMeta([
    field('title'),
    {
      type:      'field',
      fieldType: 'repeater',
      name:      'tags',
    } as ElementMeta,
  ])

  it('routes top-level names through binding.set', () => {
    const { binding, calls } = stub()
    routeBindingWrite(binding, formMetaWithRepeater, {}, 'title', 'Hello')
    assert.deepEqual(calls, [{ kind: 'set', args: ['title', 'Hello'] }])
  })

  it('routes row leaves through binding.setRow when implemented', () => {
    const { binding, calls } = stub({ withSetRow: true })
    const values = { 'tags.0.__id': 'row-a' }
    routeBindingWrite(binding, formMetaWithRepeater, values, 'tags.0.label', 'Hi')
    assert.deepEqual(calls, [{ kind: 'setRow', args: ['tags', 'row-a', 'label', 'Hi'] }])
  })

  it('drops row-leaf writes when the binding lacks setRow (pre-F.5)', () => {
    const { binding, calls } = stub()
    const values = { 'tags.0.__id': 'row-a' }
    routeBindingWrite(binding, formMetaWithRepeater, values, 'tags.0.label', 'Hi')
    assert.deepEqual(calls, [])
  })

  it('drops row-leaf writes when the row hasn\'t been stamped with __id yet', () => {
    const { binding, calls } = stub({ withSetRow: true })
    routeBindingWrite(binding, formMetaWithRepeater, {}, 'tags.0.label', 'Hi')
    assert.deepEqual(calls, [])
  })

  it('skips fields opted out via .collab(false)', () => {
    const optedOut = formMeta([
      { ...field('private'), collab: false } as ElementMeta,
    ])
    const { binding, calls } = stub()
    routeBindingWrite(binding, optedOut, {}, 'private', 'sensitive')
    assert.deepEqual(calls, [])
  })

  it('is a no-op when no binding is registered', () => {
    // No throw, no work — same posture as the v1 binding-absent path.
    assert.doesNotThrow(() => routeBindingWrite(null, formMetaWithRepeater, {}, 'title', 'x'))
  })

  it('does NOT call setRow for nested-Repeater paths (out of scope v1)', () => {
    const { binding, calls } = stub({ withSetRow: true })
    const values = {
      'articles.0.__id':      'a-1',
      'articles.0.comments.0.__id':  'c-1',
    }
    routeBindingWrite(binding, formMetaWithRepeater, values, 'articles.0.comments.0.body', 'oops')
    assert.deepEqual(calls, [])
  })

  it('handles Builder row leaves through the data wrapper', () => {
    const builderMeta = formMeta([
      { type: 'field', fieldType: 'builder', name: 'blocks' } as ElementMeta,
    ])
    const { binding, calls } = stub({ withSetRow: true })
    const values = { 'blocks.0.__id': 'blk-1' }
    routeBindingWrite(binding, builderMeta, values, 'blocks.0.data.body', 'Lorem')
    assert.deepEqual(calls, [{ kind: 'setRow', args: ['blocks', 'blk-1', 'body', 'Lorem'] }])
  })
})

describe('fieldOptsOutOfCollab', () => {
  it('returns true only when the field carries an explicit collab=false', () => {
    const meta = formMeta([
      { ...field('shared') } as ElementMeta,
      { ...field('hidden'), collab: false } as ElementMeta,
    ])
    assert.equal(fieldOptsOutOfCollab(meta, 'shared'), false)
    assert.equal(fieldOptsOutOfCollab(meta, 'hidden'), true)
  })

  it('returns false when the field is absent', () => {
    const meta = formMeta([field('present')])
    assert.equal(fieldOptsOutOfCollab(meta, 'ghost'), false)
  })
})
