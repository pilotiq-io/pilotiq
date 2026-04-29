import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Notification, _resetNotificationIdSeq } from './Notification.js'

beforeEach(() => _resetNotificationIdSeq())

describe('Notification builder', () => {
  it('defaults to type:info', () => {
    const meta = Notification.make('Hello').toMeta()
    assert.equal(meta.type, 'info')
    assert.equal(meta.title, 'Hello')
  })

  it('title via constructor or .title()', () => {
    assert.equal(Notification.make('A').toMeta().title, 'A')
    assert.equal(Notification.make().title('B').toMeta().title, 'B')
  })

  it('type sugar — info / success / warning / error', () => {
    assert.equal(Notification.make().info().toMeta().type,    'info')
    assert.equal(Notification.make().success().toMeta().type, 'success')
    assert.equal(Notification.make().warning().toMeta().type, 'warning')
    assert.equal(Notification.make().error().toMeta().type,   'error')
  })

  it('body / icon / duration round-trip', () => {
    const meta = Notification.make('Saved').body('All good.').icon('check-circle-2').duration(2500).toMeta()
    assert.equal(meta.body,     'All good.')
    assert.equal(meta.icon,     'check-circle-2')
    assert.equal(meta.duration, 2500)
  })

  it('id is auto-generated when not set', () => {
    const a = Notification.make('A').toMeta()
    const b = Notification.make('B').toMeta()
    assert.notEqual(a.id, b.id)
    assert.match(a.id, /^n-\d+-\d+$/)
  })

  it('explicit .id() overrides the auto id', () => {
    const meta = Notification.make('A').id('my-id').toMeta()
    assert.equal(meta.id, 'my-id')
  })

  it('omits body / icon / duration when not set', () => {
    const meta = Notification.make('A').toMeta()
    assert.equal(meta.body,     undefined)
    assert.equal(meta.icon,     undefined)
    assert.equal(meta.duration, undefined)
  })
})
