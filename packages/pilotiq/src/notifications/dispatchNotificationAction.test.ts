/**
 * Tests for the notification-action dispatcher. Exercises the auth /
 * lookup chain end-to-end against a fake orm adapter — the route
 * layer that mounts this is exercised separately via integration
 * tests against the rudder router.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from '../Pilotiq.js'
import { Notification } from './Notification.js'
import { Action } from '../actions/Action.js'
import { _setTestAdapter, persist } from './database.js'
import { dispatchNotificationAction } from './dispatchNotificationAction.js'

// ─── Fake ORM adapter (mirror of database.test.ts) ─────────

interface Row { [k: string]: unknown }
interface FakeStore { rows: Row[] }

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
      where: (col: string, value: unknown) => {
        filters.push(r => r[col] === value)
        return qb
      },
      orderBy: (col: string, dir: 'ASC' | 'DESC' = 'ASC') => {
        order = { column: col, dir }
        return qb
      },
      paginate: async (_p: number, perPage = 25) => {
        const out = apply()
        return { data: out.slice(0, perPage), total: out.length }
      },
      count:     async () => apply().length,
      updateAll: async (data: Row) => {
        const matching = apply()
        for (const r of matching) for (const k of Object.keys(data)) r[k] = data[k]
        return matching.length
      },
      create: async (data: Row) => {
        store.rows.push({ ...data })
        return { ...data }
      },
    }
    return qb
  }
  return { adapter: { query: (t: string) => buildQB(t) }, store }
}

let fake = makeFakeAdapter()

beforeEach(() => {
  fake = makeFakeAdapter()
  _setTestAdapter(fake.adapter)
})

afterEach(() => {
  _setTestAdapter(undefined)
})

async function seedRowWithActions(opts: {
  notifiableId: string
  actions:      Action[]
}): Promise<string> {
  const n = Notification.make('Test').actions(opts.actions)
  const data = n.toDatabase() as Parameters<typeof persist>[0]['data']
  const { id } = await persist({
    notifiableType: 'users',
    notifiableId:   opts.notifiableId,
    data,
  })
  return id
}

describe('dispatchNotificationAction — auth / lookup chain', () => {
  it('401 when no user resolves', async () => {
    const result = await dispatchNotificationAction(Pilotiq.make('admin'), {
      notificationId: 'whatever',
      actionName:     'view',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           null,
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 401)
  })

  it('404 when notification id does not exist', async () => {
    const result = await dispatchNotificationAction(Pilotiq.make('admin'), {
      notificationId: 'no-such-row',
      actionName:     'view',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 404)
  })

  it('404 when the action name is not on the row', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('view').url('/p/123')],
    })
    const result = await dispatchNotificationAction(Pilotiq.make('admin'), {
      notificationId: id,
      actionName:     'nope',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 404)
  })

  it('404 when the matched action is not handler-mode', async () => {
    // url-mode actions don't dispatch through this route — clients
    // navigate the href directly. A request hitting the dispatch
    // endpoint for a url-mode action is malformed; 404 closes the door.
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('view').url('/p/123')],
    })
    const result = await dispatchNotificationAction(Pilotiq.make('admin'), {
      notificationId: id,
      actionName:     'view',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 404)
  })

  it('404 when the registry has no handler for the stored name', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('archive').handler('archive-project').payload({ projectId: 1 })],
    })
    const panel = Pilotiq.make('admin')  // no notificationHandlers registered
    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'archive',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 404)
  })
})

describe('dispatchNotificationAction — handler dispatch', () => {
  it('runs the registered handler with the stored payload', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('archive').handler('archive-project').payload({ projectId: 42 })],
    })
    let seen: unknown = null
    const panel = Pilotiq.make('admin').notificationHandlers({
      'archive-project': async (ctx) => {
        seen = { user: ctx.user, payload: ctx.payload, notificationId: ctx.notificationId }
        return { notify: { id: 'x', type: 'success', title: 'Archived' } }
      },
    })
    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'archive',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, true)
    assert.deepEqual(seen, {
      user:           { id: 1 },
      payload:        { projectId: 42 },
      notificationId: id,
    })
    assert.equal(result.ok === true && result.notifications?.[0]?.title, 'Archived')
  })

  it('flips read_at when the stored action carries markAsRead', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('archive').handler('archive-project').markAsRead()],
    })
    const panel = Pilotiq.make('admin').notificationHandlers({
      'archive-project': async () => undefined,
    })
    // Pre-condition: row is unread.
    assert.equal(fake.store.rows[0]?.['read_at'], null)

    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'archive',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, true)
    assert.equal(result.ok === true && result.markedAsRead, true)
    // Row was actually flipped — defensive in depth.
    assert.notEqual(fake.store.rows[0]?.['read_at'], null)
  })

  it('does not flip read_at when the stored action lacks markAsRead', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('archive').handler('archive-project')],
    })
    const panel = Pilotiq.make('admin').notificationHandlers({
      'archive-project': async () => undefined,
    })
    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'archive',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, true)
    assert.equal(result.ok === true && result.markedAsRead, undefined)
    assert.equal(fake.store.rows[0]?.['read_at'], null)
  })

  it('forwards a redirect from the handler', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('go').handler('go')],
    })
    const panel = Pilotiq.make('admin').notificationHandlers({
      go: async () => ({ redirect: '/somewhere' }),
    })
    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'go',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok === true && result.redirect, '/somewhere')
  })

  it('500 when the handler throws', async () => {
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('boom').handler('boom')],
    })
    const panel = Pilotiq.make('admin').notificationHandlers({
      boom: async () => { throw new Error('bang') },
    })
    const result = await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'boom',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.status, 500)
    assert.match(result.ok === false ? result.error : '', /bang/)
  })

  it('rejects payload-injection — payload reads from the stored row only', async () => {
    // The route doesn't accept a request body in v1. The dispatcher
    // takes payload exclusively from `action.payload` on the stored row,
    // so even a tampered Pilotiq config can't sneak extra keys in.
    const id = await seedRowWithActions({
      notifiableId: '1',
      actions: [Action.make('check').handler('check').payload({ a: 1 })],
    })
    let received: Record<string, unknown> = {}
    const panel = Pilotiq.make('admin').notificationHandlers({
      check: async (ctx) => { received = ctx.payload; return undefined },
    })
    await dispatchNotificationAction(panel, {
      notificationId: id,
      actionName:     'check',
      notifiableType: 'users',
      notifiableId:   '1',
      user:           { id: 1 },
    })
    assert.deepEqual(received, { a: 1 })
  })
})

describe('Pilotiq.notificationHandlers registry', () => {
  it('rejects URL-unsafe handler names at registration', () => {
    assert.throws(
      () => Pilotiq.make('admin').notificationHandlers({ 'bad name with spaces': async () => undefined }),
      /URL-safe key/,
    )
    assert.throws(
      () => Pilotiq.make('admin').notificationHandlers({ '': async () => undefined }),
      /URL-safe key/,
    )
    assert.throws(
      () => Pilotiq.make('admin').notificationHandlers({ 'with/slash': async () => undefined }),
      /URL-safe key/,
    )
  })

  it('accepts alphanumeric + dash + underscore', () => {
    Pilotiq.make('admin').notificationHandlers({
      'archive-project': async () => undefined,
      'mark_done':       async () => undefined,
      'X1':              async () => undefined,
    })
  })

  it('subsequent calls merge — later keys override earlier', () => {
    let which: string = ''
    const panel = Pilotiq.make('admin')
      .notificationHandlers({ 'a': async () => { which = 'first';  return undefined } })
      .notificationHandlers({ 'a': async () => { which = 'second'; return undefined } })
    const fn = panel.getNotificationHandler('a')
    assert.ok(fn)
    void fn!({ user: null, payload: {}, notificationId: 'x' })
    // synchronous resolution since the handler closures don't await anything
    assert.equal(which, 'second')
  })
})
