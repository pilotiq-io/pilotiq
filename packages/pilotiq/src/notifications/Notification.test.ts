import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Notification, _resetNotificationIdSeq, serializeForNotification } from './Notification.js'
import { Action } from '../actions/Action.js'

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

describe('Notification.actions([…])', () => {
  it('emits no `actions` key when the slot is empty', () => {
    const meta = Notification.make('A').toMeta()
    assert.equal(meta.actions, undefined)

    const data = Notification.make('A').toDatabase()
    assert.equal(data['actions'], undefined)
  })

  it('serializes a url-mode action through both transports', () => {
    const n = Notification.make('Hi').actions([
      Action.make('view').url('/p/123').color('primary').icon('eye'),
    ])
    const meta = n.toMeta().actions
    const data = n.toDatabase()['actions'] as unknown[]
    assert.deepEqual(meta, [{
      name:  'view',
      label: 'View',
      url:   '/p/123',
      color: 'primary',
      icon:  'eye',
    }])
    // toDatabase() emits the same shape (no closure leakage).
    assert.deepEqual(data, meta)
  })

  it('serializes a method-post action with action-url', () => {
    const meta = Notification.make('Hi').actions([
      Action.make('archive').label('Archive').method('post').action('/p/123/archive'),
    ]).toMeta().actions

    assert.deepEqual(meta, [{
      name:  'archive',
      label: 'Archive',
      post:  '/p/123/archive',
    }])
  })

  it('serializes a registry-handler action with payload', () => {
    const meta = Notification.make('Hi').actions([
      Action.make('archive')
        .label('Archive')
        .handler('archive-project')
        .payload({ projectId: 123 })
        .markAsRead(),
    ]).toDatabase()['actions'] as unknown[]

    assert.deepEqual(meta, [{
      name:        'archive',
      label:       'Archive',
      handler:     'archive-project',
      payload:     { projectId: 123 },
      markAsRead:  true,
    }])
  })

  it('omits empty payload when the slot is unset', () => {
    const meta = Notification.make('Hi').actions([
      Action.make('archive').handler('archive-project'),
    ]).toMeta().actions
    assert.equal(meta?.[0]?.payload, undefined)
  })

  it('toMeta tolerates closure handlers (transient toast escape hatch)', () => {
    // Closures don't ride the wire — the toaster reads them off
    // Notification.getActions(). The wire shape carries the action
    // name as the dispatch key.
    const meta = Notification.make('Hi').actions([
      Action.make('do').handler(async () => undefined),
    ]).toMeta().actions
    assert.equal(meta?.[0]?.handler, 'do')
    assert.equal(meta?.[0]?.url,     undefined)
    assert.equal(meta?.[0]?.post,    undefined)
  })

  it('toDatabase rejects closure handlers with a clear error', () => {
    const n = Notification.make('Hi').actions([
      Action.make('do').handler(async () => undefined),
    ])
    assert.throws(() => n.toDatabase(), /closure handler/)
  })

  it('rejects modal-form actions at config time', () => {
    const n = Notification.make('Hi').actions([
      Action.make('edit').schema([]).handler('x'),
    ])
    assert.throws(() => n.toMeta(), /modal-form/)
  })

  it('rejects submit actions at config time', () => {
    const n = Notification.make('Hi').actions([
      Action.make('save').submit(),
    ])
    assert.throws(() => n.toMeta(), /submit button/)
  })

  it('rejects bulk-placement actions at config time', () => {
    const n = Notification.make('Hi').actions([
      Action.make('bulk').placement('bulk').handler('x'),
    ])
    assert.throws(() => n.toMeta(), /bulk-placed/)
  })

  it('rejects actions with no dispatch target', () => {
    const n = Notification.make('Hi').actions([
      Action.make('orphan'),
    ])
    assert.throws(() => n.toMeta(), /no dispatch target/)
  })

  it('passes through chrome (color / outlined / size / openUrlInNewTab)', () => {
    const meta = serializeForNotification(
      Action.make('view').url('/x').color('destructive').size('lg').openUrlInNewTab(),
      { transient: true },
    )
    assert.equal(meta.color,           'destructive')
    assert.equal(meta.size,            'lg')
    assert.equal(meta.openUrlInNewTab, true)

    const outlined = serializeForNotification(
      Action.make('view').url('/x').color('primary').outlined(),
      { transient: true },
    )
    assert.equal(outlined.outlined, true)
  })

  it('Action.markAsRead() chain modifier sets the wire flag', () => {
    const meta = serializeForNotification(
      Action.make('view').url('/x').markAsRead(),
      { transient: true },
    )
    assert.equal(meta.markAsRead, true)
  })

  it('Action.markAsRead(false) clears the flag', () => {
    const meta = serializeForNotification(
      Action.make('view').url('/x').markAsRead().markAsRead(false),
      { transient: true },
    )
    assert.equal(meta.markAsRead, undefined)
  })

  it('Action.handler() switches between closure and string', () => {
    const a = Action.make('a').handler(async () => undefined)
    assert.equal(typeof a.getHandler(), 'function')
    assert.equal(a.getHandlerName(), undefined)

    a.handler('archive')
    assert.equal(a.getHandler(), undefined)
    assert.equal(a.getHandlerName(), 'archive')

    a.handler(async () => undefined)
    assert.equal(typeof a.getHandler(), 'function')
    assert.equal(a.getHandlerName(), undefined)
  })
})
