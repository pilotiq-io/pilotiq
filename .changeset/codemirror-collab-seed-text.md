---
'@pilotiq/codemirror': patch
---

refactor(codemirror): consume `useCollabSeedText` from `@rudderjs/sync/react`

`CollabCodeMirrorEditor` previously seeded its bound `Y.Text` via pilotiq core's `useCollabSeed` shim, which is `Y.XmlFragment`-only — the callback then resolved the share back to a `Y.Text` via a `(doc as Y.Doc).getText(fragmentKey)` cast. `@rudderjs/sync@1.3.0` ships `useCollabSeedText`, the symmetric sibling that binds (and seeds) a `Y.Text` directly.

The migration drops the cast and the manual `getText` call — the seed callback now receives `(_doc, yText)` already resolved to `Y.Text`. Same synced-await + `'rudder-sync-seed'` transact-origin semantics as before; this is mechanically a no-op at runtime.

Adds `@rudderjs/sync@^1.3.0` to peer deps (mirrors what `@pilotiq/tiptap` already does for its `useCollabSeed` consumption, but bumped to `^1.3.0` for the new hook).
