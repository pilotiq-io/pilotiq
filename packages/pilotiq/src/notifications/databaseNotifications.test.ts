/**
 * Builder + panelInfo() integration tests for
 * `Pilotiq.databaseNotifications()`. The transport layer (the
 * `_notifications` route family) is exercised via the storage tests +
 * `database.test.ts`; here we lock down the wire shape consumers
 * actually depend on.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from '../Pilotiq.js'
import { panelInfo } from '../pageData.js'

describe('Pilotiq.databaseNotifications() — builder', () => {
  it('opt-out by default — cfg.databaseNotifications is undefined', () => {
    const cfg = Pilotiq.make('admin').getConfig()
    assert.equal(cfg.databaseNotifications, undefined)
  })

  it('toggle without options enables with defaults', () => {
    const cfg = Pilotiq.make('admin').databaseNotifications().getConfig()
    assert.equal(cfg.databaseNotifications?.enabled, true)
    assert.equal(cfg.databaseNotifications?.position, undefined)
    assert.equal(cfg.databaseNotifications?.polling,  undefined)
  })

  it('options round-trip', () => {
    const cfg = Pilotiq.make('admin').databaseNotifications({
      position:   'sidebar',
      polling:    10,
      pageSize:   50,
      badgeColor: 'success',
      trigger:    { icon: 'bell', label: 'Inbox' },
    }).getConfig()
    assert.equal(cfg.databaseNotifications?.position,   'sidebar')
    assert.equal(cfg.databaseNotifications?.polling,    10)
    assert.equal(cfg.databaseNotifications?.pageSize,   50)
    assert.equal(cfg.databaseNotifications?.badgeColor, 'success')
    assert.equal(cfg.databaseNotifications?.trigger?.icon, 'bell')
  })

  it('null polling round-trips (disable auto-poll)', () => {
    const cfg = Pilotiq.make('admin').databaseNotifications({ polling: null }).getConfig()
    assert.equal(cfg.databaseNotifications?.polling, null)
  })

  it('databaseNotificationsPolling sugar updates the slot', () => {
    const cfg = Pilotiq.make('admin')
      .databaseNotifications()
      .databaseNotificationsPolling(120)
      .getConfig()
    assert.equal(cfg.databaseNotifications?.polling, 120)
  })

  it('databaseNotificationsPolling is a no-op when not enabled', () => {
    const cfg = Pilotiq.make('admin').databaseNotificationsPolling(5).getConfig()
    assert.equal(cfg.databaseNotifications, undefined)
  })

  it('databaseNotificationsPosition sugar updates the slot', () => {
    const cfg = Pilotiq.make('admin')
      .databaseNotifications()
      .databaseNotificationsPosition('sidebar')
      .getConfig()
    assert.equal(cfg.databaseNotifications?.position, 'sidebar')
  })
})

describe('panelInfo() — databaseNotifications meta', () => {
  it('absent when never opted in', async () => {
    const panel = await panelInfo(Pilotiq.make('admin'))
    assert.equal((panel as Record<string, unknown>)['databaseNotifications'], undefined)
  })

  it('absent when no user resolves', async () => {
    const p = Pilotiq.make('admin').databaseNotifications()
    const panel = await panelInfo(p)
    assert.equal((panel as Record<string, unknown>)['databaseNotifications'], undefined)
  })

  it('present with resolver + defaults', async () => {
    const p = Pilotiq.make('admin')
      .user(() => ({ id: 1, name: 'Sue' }))
      .databaseNotifications()
    const panel = await panelInfo(p)
    const dn = (panel as any).databaseNotifications
    assert.ok(dn, 'databaseNotifications is present')
    assert.equal(dn.position,   'topbar')
    assert.equal(dn.polling,    30)
    assert.equal(dn.pageSize,   25)
    assert.equal(dn.badgeColor, 'primary')
    assert.equal(dn.listUrl,    '/admin/_notifications')
    assert.equal(dn.readAllUrl, '/admin/_notifications/read-all')
    assert.equal(dn.readUrl,    '/admin/_notifications/:id/read')
    assert.equal(dn.unreadUrl,  '/admin/_notifications/:id/unread')
  })

  it('honors custom path for URL building', async () => {
    const p = Pilotiq.make('admin')
      .path('/dashboard')
      .user(() => ({ id: 1 }))
      .databaseNotifications()
    const panel = await panelInfo(p)
    const dn = (panel as any).databaseNotifications
    assert.equal(dn.listUrl, '/dashboard/_notifications')
  })

  it('null polling round-trips to the wire', async () => {
    const p = Pilotiq.make('admin')
      .user(() => ({ id: 1 }))
      .databaseNotifications({ polling: null })
    const panel = await panelInfo(p)
    const dn = (panel as any).databaseNotifications
    assert.equal(dn.polling, null)
  })

  it('per-call options override defaults', async () => {
    const p = Pilotiq.make('admin')
      .user(() => ({ id: 1 }))
      .databaseNotifications({
        position:   'sidebar',
        polling:    5,
        pageSize:   10,
        badgeColor: 'warning',
      })
    const panel = await panelInfo(p)
    const dn = (panel as any).databaseNotifications
    assert.equal(dn.position,   'sidebar')
    assert.equal(dn.polling,    5)
    assert.equal(dn.pageSize,   10)
    assert.equal(dn.badgeColor, 'warning')
  })

  it('trigger overrides ride through to the wire', async () => {
    const p = Pilotiq.make('admin')
      .user(() => ({ id: 1 }))
      .databaseNotifications({ trigger: { icon: 'bell', label: 'Inbox' } })
    const panel = await panelInfo(p)
    const dn = (panel as any).databaseNotifications
    assert.deepEqual(dn.trigger, { icon: 'bell', label: 'Inbox' })
  })
})
