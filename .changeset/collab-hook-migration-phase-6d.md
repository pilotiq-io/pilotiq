---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': patch
'@pilotiq/codemirror': patch
---

feat(collab): consume `@rudderjs/sync/react`'s collab-room lifecycle via `useCollabSeed` (Phase 6d of the code-quality sweep)

The same `provider.once('synced', …)` + empty-fragment seed dance was duplicated across four pilotiq adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`, `CollabCodeMirrorEditor`) and `@pilotiq-pro/collab`'s `useRecordCollabRoom`. `@rudderjs/sync@1.2.0` shipped `@rudderjs/sync/react` with `CollabRoomManager` (cancellation-safe, idempotent stop, optional `y-indexeddb`); this PR threads its synced Promise through pilotiq's open-core `CollabRoom` so adapters can consume the consolidated seed-gate via `useCollabSeed`.

**`@pilotiq/pilotiq` (minor — new public API + widened `CollabRoom` shape, both additive)**

- `CollabRoom` interface widened with two optional fields:
  - `synced?: Promise<void>` — resolves on the provider's first sync. Stamped by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`; absent for legacy / hand-rolled providers.
  - `persistence?: unknown` — `y-indexeddb` handle, opaque to pilotiq core. Present when the room owner wired offline persistence; absent otherwise.
- New `useCollabSeed(room, fragmentKey, seedFn)` hook (re-exported from `@pilotiq/pilotiq/react`). Mirrors `@rudderjs/sync/react`'s shape — reimplemented locally so pilotiq core stays free of any hard runtime dep on Yjs. Waits for `room.synced` to resolve, wraps `seedFn` in `ydoc.transact(..., 'pilotiq-collab-seed')`. Consumers manage their own share-type lookup (`doc.getXmlFragment(key)` for Tiptap; `doc.getText(key)` for CodeMirror) and emptiness check, since the share type varies per adapter and pilotiq's `CollabRoom.ydoc` stays `unknown`.
- `onProviderSynced` is unchanged and still exported for back-compat — legacy rooms without `.synced` short-circuit through `useCollabSeed` immediately (seeded=true with no callback fired), so any adapter still calling `onProviderSynced` keeps working unchanged.

**`@pilotiq/tiptap` (patch — internal migration, no public-surface change)**

`TiptapEditor`, `MarkdownEditor`, and `CollabTextRenderer` each dropped their inline `useEffect(() => onProviderSynced(provider, trySeed), [editor, collabActive, room])` block in favour of one `useCollabSeed(editor && collabActive ? room : null, collabName, seedFn)`. The shape of the seed (Y.XmlFragment empty-check + `editor.commands.setContent(initialContent)` via the y-prosemirror binding) is unchanged. Roughly −40 LOC per file; the `hasSeeded` `useState` slots are gone (the hook owns dedup).

**`@pilotiq/codemirror` (patch — internal migration, additive prop)**

- New optional `synced?: Promise<void> | null` prop on `CollabCodeMirrorEditor`. Threaded from the wrapper in `CodeMirrorEditor.tsx`'s `<CollabBranch>` so the renderer can gate the brand-new-record Y.Text seed on the same Promise.
- Seed logic moved out of the EditorView mount effect to a top-level `useCollabSeed` call. The mount-time pre-seed (`EditorState.create({ doc: yText.toString(), ... })`) is unchanged — that path handles re-mount onto a yText that already has content (e.g. `renameRow` clones); the post-sync seed handles brand-new records where the share is empty after first sync.
- `onProviderSynced` + `SyncedProviderLike` no longer imported. The `synced` prop is optional with `null` default — passing nothing falls back to seeding immediately, matching the legacy `onProviderSynced(null, …)` no-op posture.

No wire-protocol changes. The race window (two peers mounting against a brand-new record may both see "empty" + seed) is unchanged from the prior `onProviderSynced` path; the fix is server-side seed handoff, deferred.

Coverage: existing tests pass unchanged (tiptap 183/183, codemirror 22/22, pilotiq monorepo typecheck 9/9). Dual-browser smoke via the existing `pilotiq-pro/e2e/collab` Playwright suite gates the actual sync behaviour.
