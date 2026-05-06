/**
 * Boot-time broadcast auth registration — unit tests. Uses the
 * `_setTestBroadcastAuth` seam to inject a fake `@rudderjs/broadcast`
 * module so we can capture the (pattern, callback) pair pilotiq registers
 * and assert the auth callback's gating logic.
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from '../Pilotiq.js'
import {
  registerBroadcastAuth,
  _setTestBroadcastAuth,
} from './registerBroadcastAuth.js'

type AuthCallback = (
  req: { headers: Record<string, string | string[] | undefined>; url: string; token?: string },
  channel: string,
) => Promise<boolean | Record<string, unknown>>

function makeFakeBroadcast() {
  const registrations: { pattern: string; callback: AuthCallback }[] = []
  return {
    registrations,
    mod: {
      registerAuth(pattern: string, callback: AuthCallback) {
        registrations.push({ pattern, callback })
      },
    },
  }
}

describe('registerBroadcastAuth()', () => {
  afterEach(() => _setTestBroadcastAuth(undefined))

  it('no-ops when databaseNotifications() wasn\'t called', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    await registerBroadcastAuth(Pilotiq.make('a'))
    assert.equal(fake.registrations.length, 0)
  })

  it('no-ops when broadcast wasn\'t enabled', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a').databaseNotifications()
    await registerBroadcastAuth(p)
    assert.equal(fake.registrations.length, 0)
  })

  it('no-ops when @rudderjs/broadcast is unavailable', async () => {
    _setTestBroadcastAuth(null)
    const p = Pilotiq.make('a')
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    // No throw == soft-fail OK
  })

  it('registers the private-pilotiq-notifications.* pattern', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a')
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    assert.equal(fake.registrations.length, 1)
    assert.equal(fake.registrations[0]!.pattern, 'private-pilotiq-notifications.*')
  })

  it('auth callback returns true when the user.id matches the channel id', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a')
      .user(() => ({ id: 42, name: 'Sue' }))
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    const cb = fake.registrations[0]!.callback
    const result = await cb(
      { headers: {}, url: '/ws' },
      'private-pilotiq-notifications.42',
    )
    assert.equal(result, true)
  })

  it('auth callback returns false on user-id mismatch', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a')
      .user(() => ({ id: 42 }))
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    const cb = fake.registrations[0]!.callback
    const result = await cb(
      { headers: {}, url: '/ws' },
      'private-pilotiq-notifications.7',
    )
    assert.equal(result, false)
  })

  it('auth callback returns false when no user resolves', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a')
      .user(() => null)
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    const cb = fake.registrations[0]!.callback
    const result = await cb(
      { headers: {}, url: '/ws' },
      'private-pilotiq-notifications.42',
    )
    assert.equal(result, false)
  })

  it('auth callback returns false when channel name is malformed', async () => {
    const fake = makeFakeBroadcast()
    _setTestBroadcastAuth(fake.mod)
    const p = Pilotiq.make('a')
      .user(() => ({ id: 1 }))
      .databaseNotifications()
      .databaseNotificationsBroadcast()
    await registerBroadcastAuth(p)
    const cb = fake.registrations[0]!.callback
    const result = await cb(
      { headers: {}, url: '/ws' },
      'private-other-thing.1',
    )
    assert.equal(result, false)
  })
})
