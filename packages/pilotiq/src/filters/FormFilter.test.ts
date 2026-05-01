import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { FormFilter, parseFormFilterValue, encodeFormFilterValue } from './FormFilter.js'
import { TextField } from '../fields/TextField.js'
import { NumberField } from '../fields/NumberField.js'
import { SelectField } from '../fields/SelectField.js'
import { Section } from '../schema/Section.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

describe('parseFormFilterValue / encodeFormFilterValue', () => {
  it('round-trips a typical multi-field payload', () => {
    const enc = encodeFormFilterValue({ min: 100, max: 500 })
    assert.equal(enc, '{"min":100,"max":500}')
    const dec = parseFormFilterValue(enc)
    assert.deepEqual(dec, { min: 100, max: 500 })
  })

  it('parse returns {} for empty / null / undefined / unparseable / non-object', () => {
    assert.deepEqual(parseFormFilterValue(''),         {})
    assert.deepEqual(parseFormFilterValue(undefined),  {})
    assert.deepEqual(parseFormFilterValue('not-json'), {})
    assert.deepEqual(parseFormFilterValue('"a"'),      {})
    assert.deepEqual(parseFormFilterValue('[1,2,3]'),  {})
    assert.deepEqual(parseFormFilterValue('null'),     {})
  })

  it('encode strips undefined / null / "" / [] entries', () => {
    const enc = encodeFormFilterValue({ a: 1, b: undefined, c: null, d: '', e: [], f: 'x' })
    assert.equal(enc, '{"a":1,"f":"x"}')
  })

  it('encode returns "" for an all-empty payload', () => {
    assert.equal(encodeFormFilterValue({}),                  '')
    assert.equal(encodeFormFilterValue({ a: undefined }),    '')
    assert.equal(encodeFormFilterValue({ a: '', b: null }),  '')
  })

  it('encode keeps zero / false (legit values)', () => {
    const enc = encodeFormFilterValue({ count: 0, active: false })
    assert.equal(enc, '{"count":0,"active":false}')
  })
})

describe('FormFilter shape', () => {
  it('emits kind:form', async () => {
    const meta = await FormFilter.make('amount')
      .form([NumberField.make('min'), NumberField.make('max')])
      .toMeta()
    assert.equal(meta.kind, 'form')
    assert.equal(meta.name, 'amount')
  })

  it('emits formSchema with the inner field metas', async () => {
    const meta = await FormFilter.make('amount')
      .form([NumberField.make('min').label('Min'), NumberField.make('max').label('Max')])
      .toMeta()
    assert.ok(Array.isArray(meta.formSchema))
    assert.equal(meta.formSchema!.length, 2)
    assert.equal((meta.formSchema![0] as unknown as { name: string }).name, 'min')
    assert.equal((meta.formSchema![1] as unknown as { name: string }).name, 'max')
  })

  it('default placeholder is "Filter"', async () => {
    const meta = await FormFilter.make('x').toMeta()
    assert.equal(meta.placeholder, 'Filter')
  })

  it('placeholder() override wins', async () => {
    const meta = await FormFilter.make('x').placeholder('Refine').toMeta()
    assert.equal(meta.placeholder, 'Refine')
  })

  it('label override + auto-derived label work the same as the base', async () => {
    const auto   = await FormFilter.make('priceRange').toMeta()
    const custom = await FormFilter.make('priceRange').label('Price').toMeta()
    assert.equal(auto.label,   'PriceRange')
    assert.equal(custom.label, 'Price')
  })

  it('handle((q, values)) wraps the base query() with a parsing decorator', () => {
    const f = FormFilter.make('amount')
      .form([NumberField.make('min'), NumberField.make('max')])
      .handle((q: ModelQuery, { min, max }: Record<string, unknown>) => {
        if (min !== undefined) q = q.where('price', '>=', Number(min))
        if (max !== undefined) q = q.where('price', '<=', Number(max))
        return q
      })
    const calls: Array<[string, string, unknown]> = []
    const stubQuery = makeStubQuery(calls)
    const fn = f.getQuery()!
    fn(stubQuery, '{"min":100,"max":500}')
    assert.deepEqual(calls, [
      ['price', '>=', 100],
      ['price', '<=', 500],
    ])
  })

  it('handle callback receives an empty object for an empty / unparseable URL value', () => {
    let seen: Record<string, unknown> | undefined
    const f = FormFilter.make('x')
      .form([])
      .handle((q, vals) => { seen = vals; return q })
    f.getQuery()!(makeStubQuery([]), '')
    assert.deepEqual(seen, {})

    f.getQuery()!(makeStubQuery([]), 'not-json')
    assert.deepEqual(seen, {})
  })

  it('default queryFn (no .handle()) is a no-op so modelDefaults takes the customQuery branch', () => {
    const f = FormFilter.make('x').form([])
    const stubQuery = makeStubQuery([])
    const fn = f.getQuery()
    assert.equal(typeof fn, 'function')
    const result = fn!(stubQuery, '{"a":1}')
    assert.equal(result, stubQuery, 'no-op queryFn returns the input query unchanged')
  })
})

describe('FormFilter.toMeta — value hydration', () => {
  it('hydrates inner field defaultValues from the parsed URL value', async () => {
    const f = FormFilter.make('amount')
      .form([NumberField.make('min'), NumberField.make('max')])
      .withValue('{"min":100,"max":500}')
    const meta = await f.toMeta()
    const fields = meta.formSchema as unknown as Array<{ name: string; defaultValue?: unknown }>
    assert.equal(fields[0]!.defaultValue, 100)
    assert.equal(fields[1]!.defaultValue, 500)
  })

  it('only hydrates fields whose name appears in the parsed value', async () => {
    const f = FormFilter.make('search')
      .form([
        TextField.make('needle'),
        SelectField.make('category').options([{ value: 'a', label: 'A' }]),
      ])
      .withValue('{"needle":"hello"}')
    const meta = await f.toMeta()
    const fields = meta.formSchema as unknown as Array<{ name: string; defaultValue?: unknown }>
    assert.equal(fields[0]!.defaultValue, 'hello')
    assert.equal('defaultValue' in fields[1]!, false)
  })

  it('recurses into containers (Section.children)', async () => {
    const f = FormFilter.make('combo')
      .form([
        Section.make('nested').schema([
          TextField.make('inner'),
        ]),
      ])
      .withValue('{"inner":"x"}')
    const meta = await f.toMeta()
    const section = meta.formSchema![0] as unknown as { children?: Array<{ name: string; defaultValue?: unknown }> }
    assert.equal(section.children![0]!.defaultValue, 'x')
  })
})

describe('FormFilter.toMeta — indicator', () => {
  it('omits indicator when no value is set', async () => {
    const meta = await FormFilter.make('x').form([]).toMeta()
    assert.equal(meta.indicator, undefined)
  })

  it('omits indicator when the parsed value is an empty object', async () => {
    const meta = await FormFilter.make('x').form([]).withValue('{}').toMeta()
    assert.equal(meta.indicator, undefined)
  })

  it('omits indicator when every parsed entry is empty / null / undefined', async () => {
    const meta = await FormFilter.make('x').form([]).withValue('{"a":"","b":null}').toMeta()
    assert.equal(meta.indicator, undefined)
  })

  it('default indicator joins non-empty entries as "key: value, …"', async () => {
    const meta = await FormFilter.make('amount')
      .label('Price')
      .form([NumberField.make('min'), NumberField.make('max')])
      .withValue('{"min":100,"max":500}')
      .toMeta()
    assert.equal(meta.indicator, 'Price: min: 100, max: 500')
  })

  it('formIndicator((values, filter) => string) overrides with parsed values', async () => {
    const meta = await FormFilter.make('amount')
      .label('Price')
      .form([NumberField.make('min'), NumberField.make('max')])
      .formIndicator(({ min, max }) => {
        if (min !== undefined && max !== undefined) return `Price: ${min}–${max}`
        if (min !== undefined) return `Price: ≥ ${min}`
        if (max !== undefined) return `Price: ≤ ${max}`
        return 'Price'
      })
      .withValue('{"min":100,"max":500}')
      .toMeta()
    assert.equal(meta.indicator, 'Price: 100–500')
  })

  it('inherited indicator(string) override still works', async () => {
    const meta = await FormFilter.make('x')
      .form([])
      .indicator('Static label')
      .withValue('{"a":1}')
      .toMeta()
    assert.equal(meta.indicator, 'Static label')
  })

  it('booleans format as Yes/No in the default formatter', async () => {
    const meta = await FormFilter.make('flags')
      .label('Flags')
      .form([])
      .withValue('{"published":true,"featured":false}')
      .toMeta()
    assert.equal(meta.indicator, 'Flags: published: Yes, featured: No')
  })
})

// ─── Test helpers ──────────────────────────────────────────────────────

function makeStubQuery(calls: Array<[string, string, unknown]>): ModelQuery {
  const stub = {
    where(...args: unknown[]) {
      const [a, b, c] = args
      if (typeof a === 'string') {
        if (typeof b === 'string' && c !== undefined) {
          calls.push([a, b, c])
        } else if (b !== undefined) {
          calls.push([a, '=', b])
        }
      }
      return stub
    },
    orWhere() { return stub },
    orderBy() { return stub },
    paginate() { return Promise.resolve({ data: [], total: 0 }) },
  } as unknown as ModelQuery
  return stub
}
