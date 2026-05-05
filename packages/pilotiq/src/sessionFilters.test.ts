import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  listFiltersKey,
  readPersistedListQuery,
  writePersistedListQuery,
  encodePersistedQuery,
} from './sessionFilters.js'

/**
 * Minimal SessionInstance stand-in — the same shape the rudder
 * `SessionInstance.get / put` exposes. Tracks `put` calls so the no-op
 * deep-equal short-circuit can be asserted.
 */
function makeSession() {
  const data: Record<string, unknown> = {}
  const puts: Array<[string, unknown]> = []
  return {
    data,
    puts,
    get<T>(key: string, fallback?: T): T | undefined {
      return (key in data ? data[key] : fallback) as T | undefined
    },
    put(key: string, value: unknown): void {
      data[key] = value
      puts.push([key, value])
    },
  }
}

describe('listFiltersKey', () => {
  it('joins prefix + basePath + slug with single colons', () => {
    assert.equal(listFiltersKey('/admin', 'posts'), 'pilotiq:filters:/admin:posts')
  })

  it('different slugs produce distinct keys', () => {
    assert.notEqual(listFiltersKey('/admin', 'posts'), listFiltersKey('/admin', 'users'))
  })
})

describe('writePersistedListQuery', () => {
  it('stores filter values and reserved-but-persistable keys', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, {
      status: 'draft',
      group:  'authorId',
      search: 'foo',
      sort:   'createdAt:desc',
      perPage: '25',
    })
    assert.deepEqual(session.data[key], {
      status: 'draft', group: 'authorId', search: 'foo', sort: 'createdAt:desc', perPage: '25',
    })
  })

  it('skips page (resets to 1 on restore) and tab (separate state)', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, {
      status: 'draft',
      page:   '3',
      tab:    'published',
    })
    assert.deepEqual(session.data[key], { status: 'draft' })
  })

  it('skips Tier-3 prefixed page keys (Table.queryStringIdentifier)', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, {
      orders_status: 'draft',
      orders_page:   '3',
      page:          '4',  // bare also dropped
    })
    assert.deepEqual(session.data[key], { orders_status: 'draft' })
  })

  it('preserves empty-string values (explicit-clear marker)', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, { status: '' })
    assert.deepEqual(session.data[key], { status: '' })
  })

  it('skips non-string values defensively', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, {
      status: 'draft',
      junk:   42 as unknown as string,
      blob:   { x: 1 } as unknown as string,
    })
    assert.deepEqual(session.data[key], { status: 'draft' })
  })

  it('no-ops when the slice deep-equals the stored value', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, { status: 'draft' })
    writePersistedListQuery(req, key, { status: 'draft' })
    assert.equal(session.puts.length, 1)
  })

  it('writes when the stored value is a different shape', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, { status: 'draft' })
    writePersistedListQuery(req, key, { status: 'draft', sort: 'id:asc' })
    assert.equal(session.puts.length, 2)
  })

  it('writes the empty slice (clears prior state)', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, { status: 'draft' })
    writePersistedListQuery(req, key, {})
    assert.deepEqual(session.data[key], {})
  })

  it('no-ops silently when no session is on req', () => {
    assert.doesNotThrow(() =>
      writePersistedListQuery({}, listFiltersKey('/admin', 'posts'), { status: 'draft' }),
    )
  })

  it('no-ops silently on undefined req', () => {
    assert.doesNotThrow(() =>
      writePersistedListQuery(undefined, listFiltersKey('/admin', 'posts'), { status: 'draft' }),
    )
  })
})

describe('readPersistedListQuery', () => {
  it('returns the stored slice', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    writePersistedListQuery(req, key, { status: 'draft' })
    assert.deepEqual(readPersistedListQuery(req, key), { status: 'draft' })
  })

  it('returns undefined when nothing was stored', () => {
    const session = makeSession()
    const req = { session }
    assert.equal(readPersistedListQuery(req, listFiltersKey('/admin', 'posts')), undefined)
  })

  it('returns undefined when stored value is the wrong shape', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    session.data[key] = ['not', 'a', 'map']
    assert.equal(readPersistedListQuery(req, key), undefined)
    session.data[key] = 'string'
    assert.equal(readPersistedListQuery(req, key), undefined)
  })

  it('drops non-string entries defensively', () => {
    const session = makeSession()
    const req = { session }
    const key = listFiltersKey('/admin', 'posts')
    session.data[key] = { status: 'draft', n: 42, m: { x: 1 } }
    assert.deepEqual(readPersistedListQuery(req, key), { status: 'draft' })
  })

  it('returns undefined when no session is mounted', () => {
    assert.equal(readPersistedListQuery({}, listFiltersKey('/admin', 'posts')), undefined)
  })
})

describe('encodePersistedQuery', () => {
  it('builds a stable URLSearchParams string', () => {
    const qs = encodePersistedQuery({ status: 'draft', sort: 'id:desc' })
    const params = new URLSearchParams(qs)
    assert.equal(params.get('status'), 'draft')
    assert.equal(params.get('sort'),   'id:desc')
  })

  it('drops empty-value entries (explicit-clear markers do not redirect)', () => {
    assert.equal(encodePersistedQuery({ status: '' }), '')
  })

  it('returns an empty string for an empty slice', () => {
    assert.equal(encodePersistedQuery({}), '')
  })
})
