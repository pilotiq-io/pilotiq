import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { TrashedFilter } from './TrashedFilter.js'
import { Table } from '../elements/Table.js'
import { Resource } from '../Resource.js'
import { applyTableDefaults } from '../defaultPages.js'
import type { ModelQuery } from '../orm/modelDefaults.js'

/** Stub query that records which trashed-scope methods got called. */
function makeStubQuery() {
  const calls: string[] = []
  const q = {
    where:    () => q,
    orWhere:  () => q,
    orderBy:  () => q,
    paginate: async () => ({ data: [], total: 0 }),
    withTrashed: () => { calls.push('withTrashed'); return q },
    onlyTrashed: () => { calls.push('onlyTrashed'); return q },
  } as unknown as ModelQuery
  return { q, calls }
}

describe('TrashedFilter', () => {
  it('default name is "trashed"', () => {
    const f = TrashedFilter.make()
    assert.equal(f.name, 'trashed')
  })

  it('accepts a custom URL key (e.g. archived)', () => {
    const f = TrashedFilter.make('archived')
    assert.equal(f.name, 'archived')
  })

  it('renders as a select kind with two options + "Active" placeholder', () => {
    const meta = TrashedFilter.make().toMeta()
    assert.equal(meta.kind, 'select')
    assert.equal(meta.placeholder, 'Active')
    assert.deepEqual(meta.options, [
      { value: 'withTrashed', label: 'With trashed' },
      { value: 'onlyTrashed', label: 'Only trashed' },
    ])
  })

  it('value=withTrashed calls query.withTrashed()', () => {
    const f = TrashedFilter.make()
    const handler = f.getQuery()!
    const { q, calls } = makeStubQuery()
    handler(q, 'withTrashed')
    assert.deepEqual(calls, ['withTrashed'])
  })

  it('value=onlyTrashed calls query.onlyTrashed()', () => {
    const f = TrashedFilter.make()
    const handler = f.getQuery()!
    const { q, calls } = makeStubQuery()
    handler(q, 'onlyTrashed')
    assert.deepEqual(calls, ['onlyTrashed'])
  })

  it('empty / unknown value is a no-op (default scope already excludes trashed)', () => {
    const f = TrashedFilter.make()
    const handler = f.getQuery()!
    const { q, calls } = makeStubQuery()
    handler(q, '')
    handler(q, 'active')
    handler(q, 'garbage')
    assert.deepEqual(calls, [])
  })

  it('gracefully no-ops when query lacks withTrashed (e.g. non-soft-delete query)', () => {
    const f = TrashedFilter.make()
    const handler = f.getQuery()!
    const bareQ = {
      where:    () => bareQ,
      orWhere:  () => bareQ,
      orderBy:  () => bareQ,
      paginate: async () => ({ data: [], total: 0 }),
    } as unknown as ModelQuery
    const result = handler(bareQ, 'withTrashed')
    assert.equal(result, bareQ, 'returns the query unchanged when withTrashed is absent')
  })

  it('label can be overridden via .label()', () => {
    const f = TrashedFilter.make().label('Archive status')
    assert.equal(f.toMeta().label, 'Archive status')
  })
})

describe('applyTableDefaults — TrashedFilter auto-injection', () => {
  it('auto-injects TrashedFilter when Resource.softDeletes = true', () => {
    class R extends Resource {
      static override label = 'Posts'
      static override softDeletes = true
    }
    const table = R.table(Table.make())
    applyTableDefaults(R, table)
    const filters = table.getFilters()
    assert.equal(filters.length, 1)
    assert.ok(filters[0] instanceof TrashedFilter)
  })

  it('does not double-inject when the user already added a TrashedFilter', () => {
    class R extends Resource {
      static override label = 'Posts'
      static override softDeletes = true
      static override table(t: Table): Table {
        return t.filters([TrashedFilter.make().label('Custom label')])
      }
    }
    const table = R.table(Table.make())
    applyTableDefaults(R, table)
    const filters = table.getFilters()
    assert.equal(filters.length, 1)
    assert.equal(filters[0]!.toMeta().label, 'Custom label',
      'user-supplied filter wins over the auto-injected one')
  })

  it('does not inject when Resource.softDeletes = false (default)', () => {
    class R extends Resource { static override label = 'Posts' }
    const table = R.table(Table.make())
    applyTableDefaults(R, table)
    assert.equal(table.getFilters().length, 0)
  })

  it('preserves user-supplied non-trashed filters alongside the auto-injected one', async () => {
    const { SelectFilter } = await import('./SelectFilter.js')
    class R extends Resource {
      static override label = 'Posts'
      static override softDeletes = true
      static override table(t: Table): Table {
        return t.filters([
          SelectFilter.make('status').options([
            { value: 'draft',     label: 'Draft' },
            { value: 'published', label: 'Published' },
          ]),
        ])
      }
    }
    const table = R.table(Table.make())
    applyTableDefaults(R, table)
    const filters = table.getFilters()
    assert.equal(filters.length, 2)
    assert.equal(filters[0]!.name, 'status')
    assert.ok(filters[1] instanceof TrashedFilter)
  })
})
