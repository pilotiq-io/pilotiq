import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  listFiltersKey,
  lastTabKey,
  readPersistedListQuery,
  writePersistedListQuery,
  readPersistedLastTab,
  writePersistedLastTab,
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
  it('joins prefix + basePath + slug + slot:<tab> with single colons', () => {
    assert.equal(listFiltersKey('/admin', 'posts'),         'pilotiq:filters:/admin:posts:slot:')
    assert.equal(listFiltersKey('/admin', 'posts', ''),     'pilotiq:filters:/admin:posts:slot:')
    assert.equal(listFiltersKey('/admin', 'posts', 'drafts'), 'pilotiq:filters:/admin:posts:slot:drafts')
  })

  it('different slugs produce distinct keys', () => {
    assert.notEqual(listFiltersKey('/admin', 'posts'), listFiltersKey('/admin', 'users'))
  })

  it('different tabs on the same slug produce distinct keys', () => {
    assert.notEqual(
      listFiltersKey('/admin', 'posts', 'drafts'),
      listFiltersKey('/admin', 'posts', 'published'),
    )
  })
})

describe('lastTabKey', () => {
  it('joins prefix + basePath + slug + lastTab', () => {
    assert.equal(lastTabKey('/admin', 'posts'), 'pilotiq:filters:/admin:posts:lastTab')
  })

  it('does not collide with any slot key', () => {
    // The slot namespace is `:slot:<tab>`; lastTab key is `:lastTab`. The
    // `:slot:` infix prevents a tab literally named `lastTab` from clobbering.
    assert.notEqual(lastTabKey('/admin', 'posts'), listFiltersKey('/admin', 'posts', 'lastTab'))
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

  it('per-tab keying — same slug, different tabs land in distinct slots', () => {
    const session = makeSession()
    const req = { session }
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts'),    { status: 'draft' })
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'published'), { sort: 'title:asc' })
    assert.deepEqual(session.data[listFiltersKey('/admin', 'posts', 'drafts')],    { status: 'draft' })
    assert.deepEqual(session.data[listFiltersKey('/admin', 'posts', 'published')], { sort: 'title:asc' })
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

  it('per-tab keying — reading one tab\'s slot does not pull in another\'s', () => {
    const session = makeSession()
    const req = { session }
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts'),    { status: 'draft' })
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'published'), { sort: 'title:asc' })
    assert.deepEqual(readPersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts')),    { status: 'draft' })
    assert.deepEqual(readPersistedListQuery(req, listFiltersKey('/admin', 'posts', 'published')), { sort: 'title:asc' })
  })
})

describe('lastTab pointer', () => {
  it('writePersistedLastTab + readPersistedLastTab round-trip', () => {
    const session = makeSession()
    const req = { session }
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), 'drafts')
  })

  it('returns undefined when no pointer was written', () => {
    const session = makeSession()
    const req = { session }
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), undefined)
  })

  it('overwrites on subsequent writes', () => {
    const session = makeSession()
    const req = { session }
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    writePersistedLastTab(req, '/admin', 'posts', 'published')
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), 'published')
  })

  it('no-ops when the pointer is unchanged', () => {
    const session = makeSession()
    const req = { session }
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    assert.equal(session.puts.length, 1)
  })

  it('persists empty string explicitly (user moved off a named tab back to default)', () => {
    const session = makeSession()
    const req = { session }
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    writePersistedLastTab(req, '/admin', 'posts', '')
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), '')
  })

  it('returns undefined when stored value is non-string', () => {
    const session = makeSession()
    const req = { session }
    session.data[lastTabKey('/admin', 'posts')] = 42 as unknown
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), undefined)
  })

  it('no-ops silently when no session is mounted', () => {
    assert.doesNotThrow(() => writePersistedLastTab({}, '/admin', 'posts', 'drafts'))
    assert.equal(readPersistedLastTab({}, '/admin', 'posts'), undefined)
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

  it('returns an empty string for an empty slice and no tab', () => {
    assert.equal(encodePersistedQuery({}), '')
    assert.equal(encodePersistedQuery({}, ''), '')
  })

  it('prepends ?tab=<name> when tab arg is non-empty', () => {
    const qs = encodePersistedQuery({ status: 'draft' }, 'published')
    const params = new URLSearchParams(qs)
    assert.equal(params.get('tab'),    'published')
    assert.equal(params.get('status'), 'draft')
  })

  it('emits ?tab=<name> alone when slice is empty', () => {
    const qs = encodePersistedQuery({}, 'published')
    const params = new URLSearchParams(qs)
    assert.equal(params.get('tab'), 'published')
    assert.equal(params.size, 1)
  })

  it('omits tab when empty (default-tab restore needs no tab param)', () => {
    const qs = encodePersistedQuery({ status: 'draft' }, '')
    const params = new URLSearchParams(qs)
    assert.equal(params.get('tab'),    null)
    assert.equal(params.get('status'), 'draft')
  })
})

describe('per-tab persistence — full round-trip', () => {
  it('two tabs each retain their own filter slice across switches', () => {
    const session = makeSession()
    const req = { session }
    // User visits ?tab=drafts&status=draft → slot:drafts + lastTab=drafts.
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts'), { tab: 'drafts', status: 'draft' })
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')
    // Then ?tab=published&sort=title:asc → slot:published + lastTab=published.
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'published'), { tab: 'published', sort: 'title:asc' })
    writePersistedLastTab(req, '/admin', 'posts', 'published')
    // Reads remain isolated per tab.
    assert.deepEqual(readPersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts')),    { status: 'draft' })
    assert.deepEqual(readPersistedListQuery(req, listFiltersKey('/admin', 'posts', 'published')), { sort: 'title:asc' })
    // lastTab pointer reflects the most recent visit.
    assert.equal(readPersistedLastTab(req, '/admin', 'posts'), 'published')
  })

  it('bare-visit restore = readLastTab → readSlot(lastTab) → encode(slot, lastTab)', () => {
    const session = makeSession()
    const req = { session }
    writePersistedListQuery(req, listFiltersKey('/admin', 'posts', 'drafts'), { tab: 'drafts', status: 'draft' })
    writePersistedLastTab(req, '/admin', 'posts', 'drafts')

    // Simulating the bare-visit restore in routes.ts.
    const restoreTab = readPersistedLastTab(req, '/admin', 'posts') ?? ''
    const slot       = readPersistedListQuery(req, listFiltersKey('/admin', 'posts', restoreTab)) ?? {}
    const qs         = encodePersistedQuery(slot, restoreTab)
    const params     = new URLSearchParams(qs)
    assert.equal(params.get('tab'),    'drafts')
    assert.equal(params.get('status'), 'draft')
  })

  it('bare-visit restore on a never-visited resource returns no qs (no redirect)', () => {
    const session = makeSession()
    const req = { session }
    const restoreTab = readPersistedLastTab(req, '/admin', 'posts') ?? ''
    const slot       = readPersistedListQuery(req, listFiltersKey('/admin', 'posts', restoreTab))
    assert.equal(slot, undefined)
  })
})
