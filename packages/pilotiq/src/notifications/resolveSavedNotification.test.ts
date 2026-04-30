import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from '../elements/Form.js'
import { Notification, _resetNotificationIdSeq } from './Notification.js'
import { resolveSavedNotification } from './resolveSavedNotification.js'

describe('resolveSavedNotification', () => {
  beforeEach(() => _resetNotificationIdSeq())

  it('returns null when nothing is configured', () => {
    const form = Form.make<{ id: number }>()
    const got = resolveSavedNotification(form, 'create', { id: 1 }, { values: {} })
    assert.equal(got, null)
  })

  it('disableSavedNotification beats every other spec', () => {
    const form = Form.make<{ id: number }>()
      .savedNotification('Saved')
      .createdNotification('Created')
      .disableSavedNotification()
    const got = resolveSavedNotification(form, 'create', { id: 1 }, { values: {} })
    assert.equal(got, null)
  })

  it('string spec produces a success notification with that title', () => {
    const form = Form.make<{ id: number }>().savedNotification('Saved')
    const got = resolveSavedNotification(form, 'update', { id: 1 }, { values: {} })
    assert.ok(got)
    assert.equal(got!.type, 'success')
    assert.equal(got!.title, 'Saved')
  })

  it('mode-specific createdNotification wins over savedNotification in create mode', () => {
    const form = Form.make<{ id: number }>()
      .savedNotification('Saved')
      .createdNotification('Created')
    const got = resolveSavedNotification(form, 'create', { id: 1 }, { values: {} })
    assert.equal(got!.title, 'Created')
  })

  it('createdNotification does NOT apply in update mode (falls back to shared)', () => {
    const form = Form.make<{ id: number }>()
      .savedNotification('Saved')
      .createdNotification('Created')
    const got = resolveSavedNotification(form, 'update', { id: 1 }, { values: {} })
    assert.equal(got!.title, 'Saved')
  })

  it('null mode-spec suppresses the toast for that mode but not the other', () => {
    const form = Form.make<{ id: number }>()
      .savedNotification('Saved')
      .createdNotification(null)
    const create = resolveSavedNotification(form, 'create', { id: 1 }, { values: {} })
    const update = resolveSavedNotification(form, 'update', { id: 1 }, { values: {} })
    assert.equal(create, null)
    assert.equal(update!.title, 'Saved')
  })

  it('function spec receives record + ctx and is recursively resolved', () => {
    const form = Form.make<{ id: number; name: string }>()
      .savedNotification((record) => `Saved #${record.id}`)
    const got = resolveSavedNotification(form, 'update', { id: 7, name: 'a' }, { values: {} })
    assert.equal(got!.title, 'Saved #7')
  })

  it('Notification builder spec passes through to meta', () => {
    const form = Form.make<{ id: number }>()
      .savedNotification(Notification.make('Done').warning().body('details'))
    const got = resolveSavedNotification(form, 'update', { id: 1 }, { values: {} })
    assert.equal(got!.type, 'warning')
    assert.equal(got!.title, 'Done')
    assert.equal(got!.body, 'details')
  })

  it('NotificationMeta object spec passes through unchanged', () => {
    const meta = { id: 'fixed', type: 'info' as const, title: 'Note' }
    const form = Form.make<{ id: number }>().savedNotification(meta)
    const got = resolveSavedNotification(form, 'update', { id: 1 }, { values: {} })
    assert.deepEqual(got, meta)
  })
})
