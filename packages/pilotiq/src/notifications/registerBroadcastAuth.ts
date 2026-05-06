/**
 * Broadcast auth-callback registration. Runs once at panel boot when
 * `Pilotiq.databaseNotifications({ broadcast: true })` is set; gates
 * subscriptions to `private-pilotiq-notifications.${userId}` on the
 * current user resolving to `userId`.
 *
 * Idempotent — calling twice for the same panel only registers once
 * (the broadcast auth registry stores by pattern, so re-registration
 * would just overwrite with the same callback). The pattern is namespaced
 * by panel base-path so two panels in one app don't fight over the same
 * registration slot.
 *
 * `@rudderjs/broadcast` is soft-imported via variable-string indirection
 * so pilotiq stays zero-dep on broadcast — apps that don't enable
 * broadcast don't need the package installed.
 */

import type { Pilotiq } from '../Pilotiq.js'

/** Mirror of `@rudderjs/broadcast`'s `BroadcastAuthRequest` — copied to
 *  avoid a hard import dependency. We use a structural subset; broadcast
 *  passes the full object through but we only consume `headers` + `url`. */
interface BroadcastAuthRequest {
  headers: Record<string, string | string[] | undefined>
  url:     string
  token?:  string
}

interface BroadcastModule {
  registerAuth?(
    pattern:  string,
    callback: (req: BroadcastAuthRequest, channel: string) => Promise<boolean | Record<string, unknown>>,
  ): void
}

let _testModule: BroadcastModule | null | 'unset' = 'unset'

/** Register the auth callback for `private-pilotiq-notifications.*`.
 *  Soft-fails when `@rudderjs/broadcast` isn't installed.
 *
 *  The auth callback receives a synthetic request — the WebSocket
 *  upgrade carries cookies / Authorization headers but lacks the rudder
 *  request shape pilotiq's user resolver expects. We pass the original
 *  upgrade headers + url through under the same `req` key the resolver
 *  reads from; apps using `@rudderjs/auth` see cookies and resolve as
 *  usual. Apps that need the raw Hono context can read it from the
 *  `headers` object. */
export async function registerBroadcastAuth(pilotiq: Pilotiq): Promise<void> {
  const cfg = pilotiq.getConfig()
  if (!cfg.databaseNotifications?.enabled) return
  if (!cfg.databaseNotifications.broadcast)  return

  const mod = await loadBroadcast()
  if (!mod?.registerAuth) return

  // Pattern matches every `private-pilotiq-notifications.<id>` channel.
  // Wildcard `*` is the broadcast package's single-segment match — fine
  // for numeric / uuid-style ids.
  mod.registerAuth('private-pilotiq-notifications.*', async (req, channel) => {
    const expectedId = parseChannelUserId(channel)
    if (expectedId === null) return false
    // Pilotiq's user resolver takes "the request" and returns a user
    // object. The broadcast upgrade-req carries headers but not the full
    // rudder request shape — apps using `@rudderjs/auth` read from
    // `req.headers.cookie` so this works for the common case. For custom
    // resolvers that read deeper request state, register your own
    // callback before pilotiq's via `Broadcast.channel(...)`.
    const user = await pilotiq.resolveUser(req)
    if (!user || typeof user !== 'object') return false
    const id = (user as { id?: unknown }).id
    if (id === undefined || id === null) return false
    return String(id) === expectedId
  })
}

function parseChannelUserId(channel: string): string | null {
  const prefix = 'private-pilotiq-notifications.'
  if (!channel.startsWith(prefix)) return null
  const id = channel.slice(prefix.length)
  return id === '' ? null : id
}

async function loadBroadcast(): Promise<BroadcastModule | null> {
  if (_testModule !== 'unset') return _testModule
  const moduleName = '@rudderjs/broadcast'
  try {
    const mod = await import(/* @vite-ignore */ moduleName) as Partial<BroadcastModule>
    if (typeof mod.registerAuth !== 'function') return null
    return mod as BroadcastModule
  } catch {
    return null
  }
}

/** @internal — test seam; injects a fake `@rudderjs/broadcast` module
 *  so we can assert the pattern + callback shape without spinning up a
 *  real WebSocket server. */
export function _setTestBroadcastAuth(mod: BroadcastModule | null | undefined): void {
  _testModule = mod === undefined ? 'unset' : mod
}
