---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': patch
'@pilotiq/codemirror': patch
---

feat(pilotiq): extract `onProviderSynced(provider, fn)` helper for the seed-on-synced collab lifecycle pattern

Adapter packages that bind to a collab room (Tiptap-backed editors, the CodeMirror collab adapter) all need the same choreography on mount: if the provider's already streamed in the initial room state, run the seed callback now; otherwise register `provider.once('synced', fn)` and clean up via `provider.off?.('synced', fn)`. That gate was implemented separately in 4 renderers (`CollabTextRenderer`, `MarkdownEditor`, `TiptapEditor` in `@pilotiq/tiptap`; `CollabCodeMirrorEditor` in `@pilotiq/codemirror`).

This change extracts the pattern into a single helper in `@pilotiq/pilotiq/react` so future bug fixes in the gate logic (StrictMode double-fire, missing-off-method providers, etc.) fix in one place and so adapters from outside this monorepo can adopt the same pattern with one import.

**New public surface on `@pilotiq/pilotiq/react`:**

- `onProviderSynced(provider, fn): () => void` — runs `fn` synchronously if `provider.synced`, otherwise registers `provider.once('synced', fn)`. Returns a cleanup that safely unregisters via `try { provider.off?.('synced', fn) } catch {}`. Null/undefined provider returns a no-op cleanup.
- `SyncedProviderLike` — structural type with `synced?: boolean`, `once?(event: 'synced', fn): void`, `off?(event: 'synced', fn): void`. No yjs / y-websocket peer dep — callers cast their concrete provider via `provider as SyncedProviderLike`.

**Adapter package changes (patch-grade):**

- `@pilotiq/tiptap`: `CollabTextRenderer`, `MarkdownEditor`, and `TiptapEditor` each replace their ~10-line gate block with `return onProviderSynced(provider, trySeed)` (still inside the existing `useEffect`).
- `@pilotiq/codemirror`: `CollabCodeMirrorEditor` stores the cleanup and invokes it alongside `view.destroy()` inside the mount effect's combined cleanup.

Behavior is unchanged — no double-fire risk, no missed-cleanup risk, no API changes for callers of any of the affected renderers.

Test coverage: 6 new unit tests in `packages/pilotiq/src/react/onProviderSynced.test.ts` cover synced-now, defer-until-synced, cleanup-before-synced, null provider, off-throws, and provider-missing-once/off.
