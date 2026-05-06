/**
 * Broadcast push helpers — unit tests. The real `@rudderjs/broadcast`
 * package isn't a peer dep here, so we inject a fake module via the
 * `_setTestBroadcast` seam in `broadcast.ts` and assert call shape.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  push,
  notificationChannel,
  NOTIFICATION_CREATED_EVENT,
  _setTestBroadcast,
} from './broadcast.js'
import { Notification } from './Notification.js'

interface BroadcastCall {
  channel: string
  event:   string
  data:    unknown
}

function makeFakeBroadcast() {
  const calls: BroadcastCall[] = []
  return {
    calls,
    mod: {
      broadcast(channel: string, event: string, data: unknown) {
        calls.push({ channel, event, data })
      },
    },
  }
}

describe('notificationChannel()', () => {
  it('builds the private channel name with the user id', () => {
    assert.equal(notificationChannel(1),    'private-pilotiq-notifications.1')
    assert.equal(notificationChannel('42'), 'private-pilotiq-notifications.42')
  })

  it('coerces non-string ids', () => {
    assert.equal(notificationChannel(123n as unknown as number), 'private-pilotiq-notifications.123')
  })
})

describe('push()', () => {
  afterEach(() => _setTestBroadcast(undefined))

  it('returns ok:false when broadcast module is unavailable', async () => {
    _setTestBroadcast(null)
    const r = await push({ recipientId: 1, payload: { id: 'n1', title: 'X' } })
    assert.equal(r.ok, false)
  })

  it('calls broadcast() with the default channel + event', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcast(fake.mod)
    const r = await push({ recipientId: 1, payload: { id: 'n1', title: 'X' } })
    assert.equal(r.ok, true)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0]!.channel, 'private-pilotiq-notifications.1')
    assert.equal(fake.calls[0]!.event,   NOTIFICATION_CREATED_EVENT)
    assert.deepEqual(fake.calls[0]!.data, { id: 'n1', title: 'X' })
  })

  it('honors channel + event overrides', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcast(fake.mod)
    await push({
      recipientId: 1,
      channel: 'public-firehose',
      event:   'custom',
      payload: {},
    })
    assert.equal(fake.calls[0]!.channel, 'public-firehose')
    assert.equal(fake.calls[0]!.event,   'custom')
  })

  it('returns ok:false when broadcast() throws', async () => {
    _setTestBroadcast({
      broadcast() { throw new Error('nope') },
    })
    const r = await push({ recipientId: 1, payload: {} })
    assert.equal(r.ok, false)
  })
})

describe('Notification.broadcast(recipient)', () => {
  beforeEach(() => _setTestBroadcast(null))
  afterEach(() => _setTestBroadcast(undefined))

  it('soft-fails when @rudderjs/broadcast isn\'t installed', async () => {
    const r = await Notification.make('Hi').info().broadcast({ id: 1 })
    assert.equal(r.ok, false)
  })

  it('pushes the toDatabase() payload on the user\'s private channel', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcast(fake.mod)
    await Notification.make('Hi').success().body('Body').url('/x').broadcast({ id: 99 })
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0]!.channel, 'private-pilotiq-notifications.99')
    assert.equal(fake.calls[0]!.event,   NOTIFICATION_CREATED_EVENT)
    const data = fake.calls[0]!.data as Record<string, unknown>
    assert.equal(data['type'],  'success')
    assert.equal(data['title'], 'Hi')
    assert.equal(data['body'],  'Body')
    assert.equal(data['url'],   '/x')
  })
})
