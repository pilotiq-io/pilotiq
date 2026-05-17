import { createContext, useContext } from 'react'

/**
 * Per-record realtime-collab room — a Y.Doc plus its WebsocketProvider,
 * shared across every collaborative field in the same form. Mirrors the
 * Tiptap "Collaborative Fields" pattern: one ydoc per record, each editor
 * scopes itself to its own `Y.XmlFragment` via the field's `name`.
 *
 * Pilotiq core does NOT instantiate the room — implementation lives in
 * `@pilotiq-pro/collab`, which mounts the context with real Yjs values
 * via `<RecordCollabRoom>`. Core just owns the shape so any field
 * renderer (Tiptap, in-house, third-party) can subscribe through one
 * open-core seam without taking a hard peer dep on Yjs.
 *
 * `ydoc` and `provider` are typed `unknown` deliberately — the consumer
 * (typically `@pilotiq/tiptap`) hands them straight to a registered
 * `CollabExtensionFactory` and never touches them directly, so pilotiq
 * core stays Yjs-free.
 */
export interface CollabRoom {
  /** `Y.Doc` instance. Opaque to pilotiq core. */
  ydoc:      unknown
  /** `WebsocketProvider` instance. Opaque to pilotiq core. */
  provider:  unknown
  /** Presence info for cursors / avatars. Forwarded to the extension factory. */
  user?: {
    name?:  string
    color?: string
  }
}

/**
 * `null` default — fields read the context, and a null result means
 * "no collab room mounted, fall back to local-only editing." This is
 * the 99% case (collab plugin not installed).
 */
export const CollabRoomContext = createContext<CollabRoom | null>(null)

/** Read the active collab room for the surrounding record, or `null`. */
export function useCollabRoom(): CollabRoom | null {
  return useContext(CollabRoomContext)
}

/**
 * Minimal structural shape every collab provider exposes for the
 * "initial room state has streamed in" signal. Kept structural so callers
 * (`@pilotiq/tiptap`, `@pilotiq/codemirror`, future adapters) can pass
 * `provider as unknown as SyncedProviderLike` without taking a hard peer
 * dep on yjs / y-websocket / y-webrtc.
 */
export interface SyncedProviderLike {
  synced?: boolean
  once?(event: 'synced', fn: () => void): void
  off?(event:  'synced', fn: () => void): void
}

const NOOP_CLEANUP = (): void => {}

/**
 * Run `fn` once the collab provider's initial room state has streamed in.
 * If the provider is already synced, `fn` fires synchronously; otherwise
 * it's registered via `provider.once('synced', fn)`. The returned cleanup
 * unregisters the once handler safely (idempotent + try/catch) so callers
 * can wire it directly into a React effect's cleanup return.
 *
 * Useful for the brand-new-record seed pattern: editors mounting against
 * a freshly-created record want to push the SSR-rendered default into
 * the empty `Y.Text` / `Y.XmlFragment` exactly once after sync, before
 * the user types. Race caveat: two peers simultaneously mounting against
 * a brand-new record can both see `length === 0` and both seed —
 * accepted today across every adapter's seed path.
 */
export function onProviderSynced(
  provider: SyncedProviderLike | null | undefined,
  fn:       () => void,
): () => void {
  if (!provider) return NOOP_CLEANUP
  if (provider.synced) {
    fn()
    return NOOP_CLEANUP
  }
  provider.once?.('synced', fn)
  return () => {
    try { provider.off?.('synced', fn) } catch { /* ignore */ }
  }
}
