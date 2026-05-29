import '../__test__/dom.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NotificationActionStrip } from './NotificationActionStrip.js'
import { renderWithProviders } from '../__test__/renderWithProviders.js'
import { installFetch } from '../__test__/fakes.js'
import type { NotificationActionMeta } from '../notifications/types.js'

// Phase 3c — the action strip inside a bell row. Three dispatch modes:
// url (navigate + optional mark-as-read), handler (POST to the action
// endpoint, then mark-read / notify / redirect from the response), and
// the disabled handler chip when there's no notification id to dispatch
// against. We capture navigation through the provider's spy and the
// handler POST through a stubbed global `fetch`.

const ACTION_URL = '/admin/_notifications/:id/_action/:actionName'

function action(over: Partial<NotificationActionMeta>): NotificationActionMeta {
  return { name: 'a', label: 'Act', ...over }
}

describe('NotificationActionStrip', () => {
  it('navigates and marks read for a url-mode action', async () => {
    const navigated: string[] = []
    const read: string[] = []
    renderWithProviders(
      <NotificationActionStrip
        actions={[action({ name: 'view', label: 'View', url: '/admin/articles/7', markAsRead: true })]}
        notificationId="n1"
        onMarkAsRead={(id) => read.push(id)}
      />,
      { navigate: (url) => { navigated.push(url) } },
    )
    await userEvent.setup().click(screen.getByRole('link', { name: 'View' }))
    assert.deepEqual(navigated, ['/admin/articles/7'])
    assert.deepEqual(read, ['n1'])
  })

  it('dispatches a handler-mode action and applies the response', async () => {
    const fetchStub = installFetch(() => ({
      status: 200,
      json: { ok: true, markedAsRead: true, redirect: '/admin/done', notifications: [{ id: 'x', type: 'success', title: 'Approved' }] },
    }))
    const navigated: string[] = []
    const read: string[] = []
    const notified: unknown[] = []
    try {
      renderWithProviders(
        <NotificationActionStrip
          actions={[action({ name: 'approve', label: 'Approve', handler: 'approve' })]}
          actionUrlTemplate={ACTION_URL}
          notificationId="n1"
          onMarkAsRead={(id) => read.push(id)}
          onNotify={(notifs) => notified.push(...notifs)}
        />,
        { navigate: (url) => { navigated.push(url) } },
      )
      await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }))
      assert.ok(fetchStub.calls.some(
        c => c.url === '/admin/_notifications/n1/_action/approve' && c.init?.method === 'POST',
      ))
      assert.deepEqual(read, ['n1'])
      assert.equal(notified.length, 1)
      assert.deepEqual(navigated, ['/admin/done'])
    } finally {
      fetchStub.restore()
    }
  })

  it('disables a handler-mode action when there is no notification id (transient toast)', () => {
    renderWithProviders(
      <NotificationActionStrip
        actions={[action({ name: 'approve', label: 'Approve', handler: 'approve' })]}
      />,
    )
    assert.equal((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled, true)
  })
})
