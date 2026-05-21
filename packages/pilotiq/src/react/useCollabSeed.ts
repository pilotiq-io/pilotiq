import { useEffect, useRef, useState } from 'react'
import type { CollabRoom } from './CollabRoomContext.js'

const SEED_ORIGIN = 'pilotiq-collab-seed'

/**
 * Run `seedFn` exactly once after the collab room's first sync.
 *
 * Mirrors `@rudderjs/sync/react`'s `useCollabSeed` shape — same purpose,
 * reimplemented here so pilotiq core stays free of any hard runtime dep
 * on Yjs. The `room` parameter is pilotiq's opaque `CollabRoom`, so the
 * seed callback receives `doc: unknown` and is responsible for its own
 * share-type lookup (`doc.getXmlFragment(key)` for Tiptap consumers,
 * `doc.getText(key)` for CodeMirror, etc.) and its own emptiness check.
 *
 * Returns `true` once the seed callback has run (or was skipped because
 * the room has no `.synced` Promise — i.e. a legacy non-framework
 * provider), so consumers can gate editor mount / placeholder swap.
 *
 * The hook wraps `seedFn` in `doc.transact(..., 'pilotiq-collab-seed')`
 * so downstream observers can filter the synthetic write. Two peers
 * mounting against a brand-new record may both see "empty" and both
 * seed — same race window as the legacy `onProviderSynced` path; the
 * fix is server-side seed handoff, deferred.
 */
export function useCollabSeed(
  room:    CollabRoom | null,
  key:     string,
  seedFn:  (doc: unknown) => void,
): boolean {
  const [seeded, setSeeded] = useState(false)
  const seedFnRef = useRef(seedFn)
  seedFnRef.current = seedFn

  useEffect(() => {
    if (!room) {
      setSeeded(false)
      return
    }
    // Legacy rooms without `.synced` — the room owner is on the hook
    // for whatever first-sync gating they used to do via
    // `onProviderSynced`. Mark seeded immediately so the consumer
    // can mount without a placeholder. No seedFn runs.
    const syncedPromise = room.synced
    if (!syncedPromise) {
      setSeeded(true)
      return
    }

    let cancelled = false
    syncedPromise.then(() => {
      if (cancelled) return
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ydoc = room.ydoc as any
        if (ydoc && typeof ydoc.transact === 'function') {
          ydoc.transact(() => seedFnRef.current(ydoc), SEED_ORIGIN)
        } else {
          seedFnRef.current(ydoc)
        }
      } catch { /* ignore — seed is best-effort */ }
      setSeeded(true)
    }).catch(() => {
      // synced rejects when the room is torn down before first sync.
      // Don't surface as a seed failure — the room is gone.
      if (!cancelled) setSeeded(false)
    })

    return () => { cancelled = true }
  }, [room, key])

  return seeded
}
