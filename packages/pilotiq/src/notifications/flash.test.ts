import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { flashNotifications, consumeFlashedNotifications } from './flash.js'
import type { NotificationMeta } from './Notification.js'

/**
 * Minimal SessionInstance stand-in: just a key/value flash store with the
 * "current request reads previous request's stash" semantics. Mirrors the
 * `flash / getFlash` shape from `@rudderjs/session` without importing it
 * (pilotiq doesn't peer-depend on session — it's optional in the host).
 */
function makeSession() {
  let prev: Record<string, unknown> = {}
  let next: Record<string, unknown> = {}
  return {
    flash(key: string, value: unknown) { next[key] = value },
    getFlash<T>(key: string, fallback?: T): T | undefined {
      return (key in prev ? prev[key] : fallback) as T | undefined
    },
    /** Test helper: simulate the redirect happening — current next becomes
     *  next request's prev. */
    advance() { prev = next; next = {} },
  }
}

const meta = (title: string): NotificationMeta => ({
  id:    `n-${title}`,
  type:  'success',
  title,
})

describe('flashNotifications / consumeFlashedNotifications', () => {
  it('roundtrip: flash on one request, consume on the next', () => {
    const session = makeSession()
    const req = { session }
    flashNotifications(req, [meta('Saved')])
    session.advance()
    const got = consumeFlashedNotifications(req)
    assert.equal(got.length, 1)
    assert.equal(got[0]!.title, 'Saved')
  })

  it('empty array no-ops (does not stash an empty key that overwrites a prior flash)', () => {
    const session = makeSession()
    const req = { session }
    flashNotifications(req, [meta('Saved')])
    flashNotifications(req, [])           // should not clobber
    session.advance()
    const got = consumeFlashedNotifications(req)
    assert.equal(got.length, 1)
    assert.equal(got[0]!.title, 'Saved')
  })

  it('undefined notifications no-op', () => {
    const session = makeSession()
    const req = { session }
    flashNotifications(req, undefined)
    session.advance()
    assert.deepEqual(consumeFlashedNotifications(req), [])
  })

  it('missing session: writes are silently dropped, reads return []', () => {
    const req = {}                         // no session at all
    assert.doesNotThrow(() => flashNotifications(req, [meta('Saved')]))
    assert.deepEqual(consumeFlashedNotifications(req), [])
  })

  it('undefined req: both helpers no-op', () => {
    assert.doesNotThrow(() => flashNotifications(undefined, [meta('Saved')]))
    assert.deepEqual(consumeFlashedNotifications(undefined), [])
  })

  it('multiple notifications survive the roundtrip in order', () => {
    const session = makeSession()
    const req = { session }
    flashNotifications(req, [meta('first'), meta('second'), meta('third')])
    session.advance()
    const got = consumeFlashedNotifications(req)
    assert.deepEqual(got.map(n => n.title), ['first', 'second', 'third'])
  })

  it('consume after no flash returns []', () => {
    const session = makeSession()
    const req = { session }
    session.advance()
    assert.deepEqual(consumeFlashedNotifications(req), [])
  })
})
