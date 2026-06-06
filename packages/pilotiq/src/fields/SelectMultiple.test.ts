import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { SelectField } from './SelectField.js'
import { TextField } from './TextField.js'
import { Form } from '../elements/Form.js'
import { Section } from '../schema/Section.js'
import {
  dispatchFormSubmit,
  extractRelationshipSelects,
  coerceFormValues,
} from '../elements/dispatchForm.js'
import { applyRelationshipSelectFill } from '../pageData.js'
import { validateSchema } from '../validation/index.js'
import type { ModelLike, ModelQuery } from '../orm/modelDefaults.js'

function makeQuery(rows: Array<Record<string, unknown>>): ModelQuery {
  const q: ModelQuery = {
    where:   () => q,
    orWhere: () => q,
    orderBy: () => q,
    paginate: async () => ({ data: rows.slice(), total: rows.length }),
  }
  return q
}

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta'  },
  { value: 'c', label: 'Gamma' },
]

describe('SelectField.multiple — meta', () => {
  it('emits sparse multiple flag', async () => {
    const single = await SelectField.make('one').options(OPTIONS).toMeta()
    assert.equal('multiple' in single, false)

    const multi = await SelectField.make('many').options(OPTIONS).multiple().toMeta()
    assert.equal(multi['multiple'], true)
  })

  it('relationship() without multiple() throws at meta-build', async () => {
    const field = SelectField.make('categories').options(OPTIONS).relationship('categories')
    await assert.rejects(() => Promise.resolve(field.toMeta()), /requires multiple\(\)/)
  })

  it('createOptionForm() with multiple() throws at meta-build', async () => {
    const field = SelectField.make('many')
      .options(OPTIONS)
      .multiple()
      .createOptionForm([TextField.make('name')])
      .createOptionUsing(async () => ({ value: 'x', label: 'X' }))
    await assert.rejects(() => Promise.resolve(field.toMeta()), /not supported together with multiple/)
  })
})

describe('SelectField.multiple — coercion', () => {
  it('parses the JSON-encoded array wire shape into string[]', () => {
    const field = SelectField.make('many').options(OPTIONS).multiple()
    const out = coerceFormValues([field], { many: '["a","b"]' })
    assert.deepEqual(out['many'], ['a', 'b'])
  })

  it('passes already-array values through, stringified', () => {
    const field = SelectField.make('many').options(OPTIONS).multiple()
    const out = coerceFormValues([field], { many: ['a', 2] })
    assert.deepEqual(out['many'], ['a', '2'])
  })

  it('normalizes empty / garbage to []', () => {
    const field = SelectField.make('many').options(OPTIONS).multiple()
    assert.deepEqual(coerceFormValues([field], { many: '' })['many'], [])
    assert.deepEqual(coerceFormValues([field], { many: 'not json' })['many'], [])
    assert.deepEqual(coerceFormValues([field], { many: '{"a":1}' })['many'], [])
    assert.deepEqual(coerceFormValues([field], {})['many'], [])
  })

  it('leaves single-select values untouched', () => {
    const field = SelectField.make('one').options(OPTIONS)
    const out = coerceFormValues([field], { one: 'a' })
    assert.equal(out['one'], 'a')
  })
})

describe('SelectField.multiple — required()', () => {
  it('fails on the empty wire shapes', async () => {
    const field = SelectField.make('many').options(OPTIONS).multiple().required()
    // '[]' — the JSON-encoded empty hidden input (validation runs pre-coerce).
    const e1 = await validateSchema([field], { many: '[]' })
    assert.ok(e1['many']?.length)
    // [] — already-structured empty array (live() round-trip shape).
    const e2 = await validateSchema([field], { many: [] })
    assert.ok(e2['many']?.length)
    // Populated passes.
    const e3 = await validateSchema([field], { many: '["a"]' })
    assert.equal(e3['many'], undefined)
  })
})

describe('SelectField.relationship — extraction', () => {
  it('pulls relationship-backed multi-select values out of data', () => {
    const select = SelectField.make('categories').options(OPTIONS).multiple().relationship('categories')
    const data: Record<string, unknown> = { title: 'Post', categories: ['a', 'b'], plainMulti: ['x'] }
    const plain = SelectField.make('plainMulti').options(OPTIONS).multiple()

    const deferrals = extractRelationshipSelects([select, plain], data)
    assert.equal(deferrals.length, 1)
    assert.equal(deferrals[0]!.name, 'categories')
    assert.deepEqual(deferrals[0]!.ids, ['a', 'b'])
    assert.equal('categories' in data, false)
    // Non-relationship multi-select stays in data (JSON column shape).
    assert.deepEqual(data['plainMulti'], ['x'])
    assert.equal(data['title'], 'Post')
  })

  it('finds fields nested inside layout containers', () => {
    const select = SelectField.make('authors').options(OPTIONS).multiple().relationship('authors')
    const data: Record<string, unknown> = { authors: ['a'] }
    const deferrals = extractRelationshipSelects([Section.make('Meta').schema([select])], data)
    assert.equal(deferrals.length, 1)
    assert.deepEqual(deferrals[0]!.ids, ['a'])
  })
})

describe('SelectField.relationship — full pipeline', () => {
  function makeForm() {
    return Form.make().schema([
      TextField.make('title'),
      SelectField.make('categories').options(OPTIONS).multiple().relationship('categories'),
    ])
  }

  it('syncs the submitted ids through the M2M accessor after save', async () => {
    const syncCalls: Array<ReadonlyArray<string | number>> = []
    const savedRecord = {
      id: 'p1',
      categories: () => ({
        attach: async () => {},
        detach: async () => {},
        sync:   async (ids: ReadonlyArray<string | number>) => { syncCalls.push(ids) },
      }),
    }

    const form = makeForm().save(async (data) => {
      // Parent payload never sees the relationship key.
      assert.equal('categories' in data, false)
      return savedRecord
    })

    const result = await dispatchFormSubmit(
      form,
      { title: 'Post', categories: '["a","c"]' },
      { values: {} },
    )

    assert.equal(result.ok, true)
    assert.equal(syncCalls.length, 1)
    assert.deepEqual(syncCalls[0], ['a', 'c'])
  })

  it('syncs an empty set when everything was deselected', async () => {
    const syncCalls: Array<ReadonlyArray<string | number>> = []
    const form = makeForm().save(async () => ({
      id: 'p1',
      categories: () => ({ attach: async () => {}, sync: async (ids: ReadonlyArray<string | number>) => { syncCalls.push(ids) } }),
    }))

    const result = await dispatchFormSubmit(form, { title: 'Post', categories: '[]' }, { values: {} })
    assert.equal(result.ok, true)
    assert.deepEqual(syncCalls[0], [])
  })

  it('throws a config error when the saved record has no sync accessor', async () => {
    const form = makeForm().save(async () => ({ id: 'p1' }))
    await assert.rejects(
      () => dispatchFormSubmit(form, { categories: '["a"]' }, { values: {} }),
      /no M2M accessor for 'categories'/,
    )
  })

  it('loose-diffs against numeric pivot PKs when parentModel is on the ctx', async () => {
    // Form ids are strings but the pivot stores numbers — a strict
    // accessor.sync would re-attach "3" over 3 and trip the pivot's
    // UNIQUE constraint. With parentModel available, pilotiq diffs
    // itself: attach coerced to numbers, detach with the raw PKs,
    // sync never called.
    const attachCalls: unknown[] = []
    const detachCalls: unknown[] = []
    const savedRecord = {
      id: 1,
      categories: () => ({
        attach: async (ids: unknown) => { attachCalls.push(ids) },
        detach: async (ids: unknown) => { detachCalls.push(ids) },
        sync:   async () => { throw new Error('sync must not be called when the manual diff runs') },
      }),
    }
    const childModel: ModelLike = {
      primaryKey: 'id',
      find:   async () => undefined,
      create: async (d) => d,
      update: async (_id, d) => d,
      delete: async () => {},
      query:  () => ({} as never),
    }
    // `relations` isn't on the structural ModelLike — pilotiq reads it
    // off the static via pickChildPrimaryKey, so widen through unknown.
    const parentModel = {
      ...childModel,
      relations: { categories: { type: 'belongsToMany', model: () => childModel } },
      relatedQuery: () => ({
        paginate: async () => ({ data: [{ id: 1 }, { id: 3 }], total: 2 }),
      }) as never,
    } as unknown as ModelLike

    const form = makeForm().save(async () => savedRecord)
    const result = await dispatchFormSubmit(
      form,
      { title: 'Post', categories: '["1","2"]' },
      { values: {}, parentModel } as never,
    )

    assert.equal(result.ok, true)
    assert.deepEqual(attachCalls, [[2]])
    assert.deepEqual(detachCalls, [[3]])
  })
})

describe('SelectField.relationship — edit fill', () => {
  it('stamps values with the related rows’ primary keys', async () => {
    const related = [
      { id: 'cat-1', name: 'News' },
      { id: 'cat-2', name: 'Tech' },
    ]
    const childModel: ModelLike = {
      primaryKey: 'id',
      find: async () => null, create: async () => ({}), update: async () => ({}),
      delete: async () => {}, query: () => makeQuery(related),
    }
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find: async () => null, create: async () => ({}), update: async () => ({}),
      delete: async () => {}, query: () => makeQuery([]),
      relatedQuery: () => makeQuery(related),
      relations: {
        categories: { type: 'belongsToMany', model: () => childModel, pivotTable: 'category_post' },
      },
    }

    const form = Form.make().schema([
      SelectField.make('categories').options(OPTIONS).multiple().relationship('categories'),
    ])

    const out = await applyRelationshipSelectFill(form, { title: 'Post' }, { id: 'p1' }, parentModel)
    assert.deepEqual(out['categories'], ['cat-1', 'cat-2'])
    assert.equal(out['title'], 'Post')
  })

  it('no-ops in create mode and leaves prior values on lookup failure', async () => {
    const form = Form.make().schema([
      SelectField.make('categories').options(OPTIONS).multiple().relationship('categories'),
    ])
    // Create mode — record null.
    const out1 = await applyRelationshipSelectFill(form, { categories: [] }, null, undefined)
    assert.deepEqual(out1['categories'], [])

    // Lookup throws — prior value preserved.
    const parentModel: ModelLike & { relations: Record<string, unknown> } = {
      primaryKey: 'id',
      find: async () => null, create: async () => ({}), update: async () => ({}),
      delete: async () => {}, query: () => makeQuery([]),
      relatedQuery: () => { throw new Error('boom') },
      relations: { categories: { type: 'belongsToMany', model: () => null, pivotTable: 'x' } },
    }
    const out2 = await applyRelationshipSelectFill(form, { categories: ['stale'] }, { id: 'p1' }, parentModel)
    assert.deepEqual(out2['categories'], ['stale'])
  })
})
