import '../__test__/dom.js'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useNotifications, NotificationList } from './NotificationBell.js'
import { installFetch } from '../__test__/fakes.js'
import type { DatabaseNotificationsMeta } from '../pageData.js'
import type { DatabaseNotificationMeta } from '../notifications/database.js'

// Phase 3b — database-notifications bell. The dropdown chrome is a
// base-ui menu; the load-bearing logic is the `useNotifications` hook
// (fetch-on-mount, optimistic mark-read / mark-all, latest-wins) and the
// `NotificationList` body. We drive the hook through a tiny harness with
// the global `fetch` stubbed, and render the list directly for its
// empty / unread-count chrome. Both are provider-free: `useToast` and
// `useIconFor` carry safe no-op defaults, and `useNavigate` falls back to
// `window.location` under happy-dom.

afterEach(cleanup)

const META: DatabaseNotificationsMeta = {
  position: 'sidebar',
  polling: null,
  pageSize: 10,
  badgeColor: 'primary',
  listUrl: '/admin/_notifications',
  readAllUrl: '/admin/_notifications/read-all',
  readUrl: '/admin/_notifications/:id/read',
  unreadUrl: '/admin/_notifications/:id/unread',
  actionUrl: '/admin/_notifications/:id/_action/:actionName',
}

function notif(id: string, over: Partial<DatabaseNotificationMeta> = {}): DatabaseNotificationMeta {
  return { id, createdAt: Date.now(), title: `Notice ${id}`, ...over }
}

/** Stub `fetch` over a mutable notification store so refetches reflect
 *  the effect of read / read-all POSTs (mirrors the server round-trip). */
function installNotificationFetch(initial: DatabaseNotificationMeta[]) {
  const store = initial.map(n => ({ ...n }))
  return installFetch(({ url, init }) => {
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url.endsWith('/read-all')) {
      for (const n of store) if (!n.readAt) n.readAt = new Date().toISOString()
      return {}
    }
    const readMatch = url.match(/_notifications\/([^/]+)\/read$/)
    if (method === 'POST' && readMatch) {
      const target = store.find(n => n.id === decodeURIComponent(readMatch[1]!))
      if (target && !target.readAt) target.readAt = new Date().toISOString()
      return {}
    }
    // GET list
    return { json: { notifications: store, unreadCount: store.filter(n => !n.readAt).length } }
  })
}

function Harness({ meta }: { meta: DatabaseNotificationsMeta }) {
  const { unreadCount, items, markRead, markAllRead } = useNotifications(meta)
  const unread = items.filter(i => !i.readAt).length
  return (
    <div>
      <span data-testid="count">{unreadCount}</span>
      <span data-testid="items">{items.length}</span>
      <span data-testid="unread">{unread}</span>
      <button type="button" onClick={() => markRead('n1')}>read-one</button>
      <button type="button" onClick={() => markAllRead()}>read-all</button>
    </div>
  )
}

describe('useNotifications', () => {
  it('fetches the list on mount and exposes items + unread count', async () => {
    const fetchStub = installNotificationFetch([notif('n1'), notif('n2')])
    try {
      render(<Harness meta={META} />)
      await waitFor(() => assert.equal(screen.getByTestId('count').textContent, '2'))
      assert.equal(screen.getByTestId('items').textContent, '2')
      assert.ok(fetchStub.calls.some(c => c.url === META.listUrl))
    } finally {
      fetchStub.restore()
    }
  })

  it('marks one notification read (optimistic flip + POST to readUrl)', async () => {
    const fetchStub = installNotificationFetch([notif('n1'), notif('n2')])
    try {
      render(<Harness meta={META} />)
      await waitFor(() => assert.equal(screen.getByTestId('unread').textContent, '2'))
      await userEvent.setup().click(screen.getByText('read-one'))
      await waitFor(() => assert.equal(screen.getByTestId('unread').textContent, '1'))
      assert.ok(fetchStub.calls.some(
        c => c.url === '/admin/_notifications/n1/read' && c.init?.method === 'POST',
      ))
    } finally {
      fetchStub.restore()
    }
  })

  it('marks all read (count drops to zero + POST to readAllUrl)', async () => {
    const fetchStub = installNotificationFetch([notif('n1'), notif('n2')])
    try {
      render(<Harness meta={META} />)
      await waitFor(() => assert.equal(screen.getByTestId('count').textContent, '2'))
      await userEvent.setup().click(screen.getByText('read-all'))
      await waitFor(() => assert.equal(screen.getByTestId('count').textContent, '0'))
      assert.ok(fetchStub.calls.some(
        c => c.url === META.readAllUrl && c.init?.method === 'POST',
      ))
    } finally {
      fetchStub.restore()
    }
  })
})

describe('NotificationList', () => {
  const noop = () => {}

  it('shows the loading placeholder before any items arrive', () => {
    render(
      <NotificationList
        meta={META} items={[]} loading unreadCount={0}
        markRead={noop} markAllRead={noop} onClose={noop}
      />,
    )
    assert.ok(screen.getByText('Loading…'))
  })

  it('shows the empty state when there are no notifications', () => {
    render(
      <NotificationList
        meta={META} items={[]} loading={false} unreadCount={0}
        markRead={noop} markAllRead={noop} onClose={noop}
      />,
    )
    assert.ok(screen.getByText('No notifications'))
  })

  it('renders a "Mark all as read" button only when there are unread items', async () => {
    let cleared = 0
    const { rerender } = render(
      <NotificationList
        meta={META} items={[notif('n1')]} loading={false} unreadCount={0}
        markRead={noop} markAllRead={() => { cleared++ }} onClose={noop}
      />,
    )
    assert.equal(screen.queryByRole('button', { name: 'Mark all as read' }), null)

    rerender(
      <NotificationList
        meta={META} items={[notif('n1')]} loading={false} unreadCount={1}
        markRead={noop} markAllRead={() => { cleared++ }} onClose={noop}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark all as read' }))
    assert.equal(cleared, 1)
  })
})
