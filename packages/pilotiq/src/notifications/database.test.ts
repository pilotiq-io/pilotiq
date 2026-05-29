import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  listForUser,
  unreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  persist,
  _setTestAdapter,
  _internal,
} from './database.js'
import { Notification } from './Notification.js'

// ─── Fake ORM adapter ──────────────────────────────────────

interface Row { [k: string]: unknown }
interface FakeStore {
  rows: Row[]
}

function makeFakeAdapter() {
  const store: FakeStore = { rows: [] }

  const buildQB = (_table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    let order: { column: string; dir: 'ASC' | 'DESC' } | null = null

    const apply = () => {
      let out = store.rows.slice()
      for (const f of filters) out = out.filter(f)
      if (order) {
        const { column, dir } = order
        out.sort((a, b) => {
          const av = (a[column] ?? '') as string
          const bv = (b[column] ?? '') as string
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return dir === 'DESC' ? -cmp : cmp
        })
      }
      return out
    }

    const qb: any = {
      // database.ts only uses the 2-arg `where(col, value)` shape; null
      // is a valid value (matches `read_at IS NULL`).
      where: (col: string, value: unknown) => {
        filters.push(r => r[col] === value)
        return qb
      },
      orderBy: (column: string, dir: 'ASC' | 'DESC' = 'ASC') => {
        order = { column, dir }
        return qb
      },
      paginate: async (_page: number, perPage = 25) => {
        const out = apply()
        return { data: out.slice(0, perPage), total: out.length }
      },
      count: async () => apply().length,
      updateAll: async (data: Row) => {
        const matching = apply()
        for (const r of matching) {
          for (const k of Object.keys(data)) r[k] = data[k]
        }
        return matching.length
      },
      create: async (data: Row) => {
        store.rows.push({ ...data })
        return { ...data }
      },
    }
    return qb
  }

  const adapter = {
    query: (table: string) => buildQB(table),
  }
  return { adapter, store }
}

// ─── Helpers ───────────────────────────────────────────────

function seed(store: { rows: Row[] }, ...rows: Partial<Row>[]) {
  for (const r of rows) {
    store.rows.push({
      id: `row-${store.rows.length + 1}`,
      notifiable_id:   '1',
      notifiable_type: 'users',
      type:            'PilotiqNotification',
      data:            JSON.stringify({ title: 'Test' }),
      read_at:         null,
      created_at:      new Date(2026, 0, 1).toISOString(),
      updated_at:      new Date(2026, 0, 1).toISOString(),
      ...r,
    })
  }
}

// ─── Tests ─────────────────────────────────────────────────

describe('notifications/database — _internal.rowToMeta', () => {
  it('parses JSON data column + maps known keys', () => {
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: JSON.stringify({
        title: 'Hi',
        body:  'b',
        icon:  'check',
        url:   '/x',
        type:  'success',
        irrelevant: 'ignored',
      }),
      read_at: null,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: new Date(2026, 0, 1).toISOString(),
    })
    assert.equal(meta.id,   'r1')
    assert.equal(meta.title, 'Hi')
    assert.equal(meta.body,  'b')
    assert.equal(meta.icon,  'check')
    assert.equal(meta.url,   '/x')
    assert.equal(meta.type,  'success')
    assert.equal(meta.readAt, undefined)
  })

  it('rowToMeta surfaces readAt when present', () => {
    const at = new Date(2026, 0, 2).toISOString()
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: '{}',
      read_at: at,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: at,
    })
    assert.equal(meta.readAt, at)
  })

  it('rowToMeta tolerates malformed JSON in data column', () => {
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: 'not json',
      read_at: null,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: new Date(2026, 0, 1).toISOString(),
    })
    assert.equal(meta.title, '')   // missing title becomes empty string
  })

  it('rowToMeta drops unknown type values', () => {
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: JSON.stringify({ title: 'Hi', type: 'critical' }),
      read_at: null,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: new Date(2026, 0, 1).toISOString(),
    })
    assert.equal(meta.type, undefined)
  })

  it('parses a valid actions array', () => {
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: JSON.stringify({
        title: 'Hi',
        actions: [
          { name: 'view',    label: 'View',    url: '/p/1', markAsRead: true },
          { name: 'archive', label: 'Archive', handler: 'archive-project', payload: { projectId: 1 } },
        ],
      }),
      read_at: null,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: new Date(2026, 0, 1).toISOString(),
    })
    assert.equal(meta.actions?.length, 2)
    assert.equal(meta.actions?.[0]?.url, '/p/1')
    assert.equal(meta.actions?.[0]?.markAsRead, true)
    assert.equal(meta.actions?.[1]?.handler, 'archive-project')
    assert.deepEqual(meta.actions?.[1]?.payload, { projectId: 1 })
  })

  it('drops actions that fail validation (non-string name, missing dispatch, etc)', async () => {
    // Suppress console.warn during the test — we know we're feeding bad data.
    const orig = console.warn
    console.warn = () => {}
    try {
      const meta = _internal.rowToMeta({
        id: 'r1',
        notifiable_id: '1',
        notifiable_type: 'users',
        type: 'X',
        data: JSON.stringify({
          title: 'Hi',
          actions: [
            { name: 'good', label: 'Good', url: '/x' },
            { name: 'bad-no-dispatch', label: 'Bad' },
            { /* no name */ label: 'Also bad', url: '/y' },
            { name: 'two-modes', label: 'Bad 2', url: '/y', post: '/z' },
          ],
        }),
        read_at: null,
        created_at: new Date(2026, 0, 1).toISOString(),
        updated_at: new Date(2026, 0, 1).toISOString(),
      })
      assert.equal(meta.actions?.length, 1)
      assert.equal(meta.actions?.[0]?.name, 'good')
    } finally {
      console.warn = orig
    }
  })

  it('omits the actions key when none present', () => {
    const meta = _internal.rowToMeta({
      id: 'r1',
      notifiable_id: '1',
      notifiable_type: 'users',
      type: 'X',
      data: JSON.stringify({ title: 'Hi' }),
      read_at: null,
      created_at: new Date(2026, 0, 1).toISOString(),
      updated_at: new Date(2026, 0, 1).toISOString(),
    })
    assert.equal(meta.actions, undefined)
  })
})

describe('notifications/database — store unavailable', () => {
  beforeEach(() => _setTestAdapter(null))
  afterEach(() => _setTestAdapter(undefined))

  it('listForUser returns an empty result', async () => {
    const r = await listForUser({ notifiableType: 'users', notifiableId: '1' })
    assert.deepEqual(r, { notifications: [], unreadCount: 0 })
  })

  it('unreadCount returns 0', async () => {
    assert.equal(await unreadCount({ notifiableType: 'users', notifiableId: '1' }), 0)
  })

  it('markAsRead / markAsUnread return false', async () => {
    assert.equal(await markAsRead('1',   { notifiableType: 'users', notifiableId: '1' }), false)
    assert.equal(await markAsUnread('1', { notifiableType: 'users', notifiableId: '1' }), false)
  })

  it('markAllAsRead returns 0', async () => {
    assert.equal(await markAllAsRead({ notifiableType: 'users', notifiableId: '1' }), 0)
  })

  it('persist throws — caller asked to write but no adapter', async () => {
    await assert.rejects(
      persist({ notifiableType: 'users', notifiableId: '1', data: { title: 't' } as any }),
      /no @rudderjs\/orm adapter/i,
    )
  })
})

describe('notifications/database — store wired', () => {
  let store: { rows: Row[] }

  beforeEach(() => {
    const { adapter, store: s } = makeFakeAdapter()
    store = s
    _setTestAdapter(adapter)
  })
  afterEach(() => _setTestAdapter(undefined))

  it('persist inserts a row + returns id', async () => {
    const r = await persist({
      notifiableType: 'users',
      notifiableId:   '7',
      data: { id: 'placeholder', title: 'Saved', type: 'success' } as any,
    })
    assert.match(r.id, /^pn_/)
    assert.equal(store.rows.length, 1)
    const row = store.rows[0]!
    assert.equal(row['notifiable_id'],   '7')
    assert.equal(row['notifiable_type'], 'users')
    assert.equal(row['read_at'], null)
    assert.match(row['data'] as string, /Saved/)
  })

  it('Notification.sendToDatabase round-trips through persist', async () => {
    const { id } = await Notification.make('Hi')
      .body('b').success().url('/x')
      .sendToDatabase({ id: 42 })
    assert.match(id, /^pn_/)
    assert.equal(store.rows.length, 1)
    const row  = store.rows[0]!
    const data = JSON.parse(row['data'] as string)
    assert.equal(data.title, 'Hi')
    assert.equal(data.body,  'b')
    assert.equal(data.url,   '/x')
    assert.equal(data.type,  'success')
    // recipient id coerced to string
    assert.equal(row['notifiable_id'], '42')
  })

  it('listForUser scopes by notifiable + returns unread count', async () => {
    seed(store,
      { id: 'a', notifiable_id: '1', read_at: null,                      data: JSON.stringify({ title: 'unread-1' }) },
      { id: 'b', notifiable_id: '1', read_at: new Date().toISOString(),  data: JSON.stringify({ title: 'read-1'   }) },
      { id: 'c', notifiable_id: '2', read_at: null,                      data: JSON.stringify({ title: 'someone-else' }) },
    )
    const r = await listForUser({ notifiableType: 'users', notifiableId: '1' })
    assert.equal(r.notifications.length, 2)
    assert.equal(r.unreadCount, 1)
    const titles = r.notifications.map(n => n.title).sort()
    assert.deepEqual(titles, ['read-1', 'unread-1'])
  })

  it('listForUser unreadOnly filters out read rows', async () => {
    seed(store,
      { id: 'a', notifiable_id: '1', read_at: null,                     data: JSON.stringify({ title: 'A' }) },
      { id: 'b', notifiable_id: '1', read_at: new Date().toISOString(), data: JSON.stringify({ title: 'B' }) },
    )
    const r = await listForUser({ notifiableType: 'users', notifiableId: '1', unreadOnly: true })
    assert.equal(r.notifications.length, 1)
    assert.equal(r.notifications[0]!.title, 'A')
  })

  it('markAsRead stamps read_at', async () => {
    seed(store, { id: 'a', notifiable_id: '1', read_at: null })
    const updated = await markAsRead('a', { notifiableType: 'users', notifiableId: '1' })
    assert.equal(updated, true)
    assert.notEqual(store.rows[0]!['read_at'], null)
  })

  it('markAsRead refuses cross-user access', async () => {
    seed(store, { id: 'a', notifiable_id: '1', read_at: null })
    const updated = await markAsRead('a', { notifiableType: 'users', notifiableId: '999' })
    assert.equal(updated, false)
    assert.equal(store.rows[0]!['read_at'], null)
  })

  it('markAsUnread clears read_at', async () => {
    seed(store, { id: 'a', notifiable_id: '1', read_at: new Date().toISOString() })
    const updated = await markAsUnread('a', { notifiableType: 'users', notifiableId: '1' })
    assert.equal(updated, true)
    assert.equal(store.rows[0]!['read_at'], null)
  })

  it('markAllAsRead stamps every unread row + leaves read rows alone', async () => {
    const earlier = new Date(2025, 0, 1).toISOString()
    seed(store,
      { id: 'a', notifiable_id: '1', read_at: null },
      { id: 'b', notifiable_id: '1', read_at: null },
      { id: 'c', notifiable_id: '1', read_at: earlier },
      { id: 'd', notifiable_id: '2', read_at: null },
    )
    const n = await markAllAsRead({ notifiableType: 'users', notifiableId: '1' })
    assert.equal(n, 2)
    assert.notEqual(store.rows[0]!['read_at'], null)
    assert.notEqual(store.rows[1]!['read_at'], null)
    assert.equal(store.rows[2]!['read_at'], earlier) // unchanged
    assert.equal(store.rows[3]!['read_at'], null)    // someone else's row
  })

  it('unreadCount returns only unread rows for the notifiable', async () => {
    seed(store,
      { id: 'a', notifiable_id: '1', read_at: null },
      { id: 'b', notifiable_id: '1', read_at: null },
      { id: 'c', notifiable_id: '1', read_at: new Date().toISOString() },
      { id: 'd', notifiable_id: '2', read_at: null },
    )
    const count = await unreadCount({ notifiableType: 'users', notifiableId: '1' })
    assert.equal(count, 2)
  })
})
