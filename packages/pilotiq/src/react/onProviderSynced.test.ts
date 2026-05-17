import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { onProviderSynced, type SyncedProviderLike } from './CollabRoomContext.js'

/** Bare provider double — captures `once` registrations and supports
 *  flipping `synced` so we can assert the deferred path. */
function mockProvider(initialSynced = false): SyncedProviderLike & {
  fire(): void
  registered: number
  unregistered: number
  offThrows: boolean
} {
  let synced = initialSynced
  let pending: (() => void) | null = null
  const inst = {
    get synced() { return synced },
    set synced(v: boolean) { synced = v },
    once(event: 'synced', fn: () => void) {
      assert.equal(event, 'synced', 'only synced is registered')
      pending = fn
      inst.registered++
    },
    off(event: 'synced', fn: () => void) {
      assert.equal(event, 'synced', 'only synced is unregistered')
      if (inst.offThrows) throw new Error('boom')
      if (pending === fn) pending = null
      inst.unregistered++
    },
    fire() { if (pending) { const f = pending; pending = null; f() } },
    registered:   0,
    unregistered: 0,
    offThrows:    false,
  }
  return inst
}

describe('onProviderSynced', () => {
  it('fires fn synchronously when provider is already synced', () => {
    const provider = mockProvider(true)
    let calls = 0
    const cleanup = onProviderSynced(provider, () => { calls++ })
    assert.equal(calls, 1, 'fn ran synchronously')
    assert.equal(provider.registered, 0, 'once never registered')
    cleanup()
    assert.equal(provider.unregistered, 0, 'no-op cleanup did not call off')
  })

  it('defers fn until synced event when provider not yet synced', () => {
    const provider = mockProvider(false)
    let calls = 0
    const cleanup = onProviderSynced(provider, () => { calls++ })
    assert.equal(calls, 0, 'fn not yet called')
    assert.equal(provider.registered, 1, 'once was registered')
    provider.fire()
    assert.equal(calls, 1, 'fn ran after synced fired')
    cleanup()
    assert.equal(provider.unregistered, 1, 'cleanup called off')
  })

  it('cleanup unregisters the once handler when called before synced fires', () => {
    const provider = mockProvider(false)
    let calls = 0
    const cleanup = onProviderSynced(provider, () => { calls++ })
    cleanup()
    assert.equal(provider.unregistered, 1, 'off was called')
    provider.fire()
    assert.equal(calls, 0, 'fn never fired after cleanup')
  })

  it('returns a no-op cleanup when provider is null or undefined', () => {
    const noopCleanup = onProviderSynced(null, () => { throw new Error('unreachable') })
    assert.doesNotThrow(() => noopCleanup())
    const noopCleanup2 = onProviderSynced(undefined, () => { throw new Error('unreachable') })
    assert.doesNotThrow(() => noopCleanup2())
  })

  it('swallows errors thrown by provider.off so cleanup never breaks an effect', () => {
    const provider = mockProvider(false)
    provider.offThrows = true
    const cleanup = onProviderSynced(provider, () => {})
    assert.doesNotThrow(cleanup, 'cleanup did not propagate the throw')
  })

  it('gracefully handles a provider missing once/off methods', () => {
    const sparse: SyncedProviderLike = { synced: false }
    const cleanup = onProviderSynced(sparse, () => {})
    assert.doesNotThrow(cleanup, 'cleanup is safe when off is undefined')
  })
})
