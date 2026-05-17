# @pilotiq/codemirror

## 3.2.3

### Patch Changes

- 1b8c1bc: feat(pilotiq): extract `onProviderSynced(provider, fn)` helper for the seed-on-synced collab lifecycle pattern

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

## 3.2.2

### Patch Changes

- 02d297a: chore(codemirror): simplify-pass on `CollabCodeMirrorEditor` — dedupe seed read, drop stale caveat, expose stable selector hook for e2e

  Follow-up housekeeping after the seed-from-`yText.toString()` fix shipped in `3.2.1`. No runtime behavior change for end users; the only DOM surface change is additive.

  - Capture the seed once at mount: `const seed = yText.toString()` feeds both `EditorState.create({ doc: seed })` and the initial hidden-input mirror via `setText(seed)`. The pre-fix code called `yText.toString()` twice back-to-back inside the mount effect — harmless but redundant.
  - Delete the "PK-switch row-rename caveat" paragraph from the component JSDoc. The caveat was closed end-to-end by `pilotiq-pro@5fae624`'s `rowArrayBinding.renameRow` `Y.Text` rekey branch + `@pilotiq/codemirror@3.2.1`'s seed fix. The seed-on-mount comment block at the call site already covers the operational invariant.
  - Stamp `data-pilotiq-collab-code="<hiddenInputName>"` on the editor host div. Consumer-package e2e suites (e.g. `@pilotiq-pro/collab`'s collab specs) can anchor locators on this attribute instead of walking up through the FieldShell DOM via `..`, which was tightly coupled to the current JSX nesting.
  - Remove the stale `eslint-disable @typescript-eslint/no-unused-vars` directive on the `import type * as Y from 'yjs'` line — `Y.Text` is used as a type cast in the mount effect.

## 3.2.1

### Patch Changes

- fbc75f3: fix(codemirror): seed editor doc from `yText.toString()` at mount so collab remounts onto a populated `Y.Text` paint immediately

  When `CollabCodeMirrorEditor` remounts (e.g. after a Repeater/Builder row's PK switch re-keys the row's CRDT identity from UUID to DB PK), the new `EditorView` was constructed with `doc: ''` on the assumption that `y-codemirror.next`'s `ySyncPlugin` would pull pre-existing `Y.Text` content into the editor at attach time. It doesn't — the plugin assumes editor doc + `Y.Text` are already in sync at init and only observes subsequent deltas. So a fresh editor against a `Y.Text` that already had content would paint blank until someone typed and triggered an observed delta.

  Seeding `doc` from `yText.toString()` at construction time is enough: the plugin's first observation runs against editor doc + `Y.Text` both holding the same content (no diff to dispatch), and subsequent edits propagate as before. No double-insert risk — the plugin doesn't try to re-insert content already present in the editor doc.

  Fixes the row-leaf `CodeEditorField` survives-PK-switch case in `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` `Y.Text` rekey path (pilotiq-pro@5fae624). The renameRow side was already broadcasting the cloned content correctly; the consumer-side editor just wasn't reading it on remount.

## 3.2.0

### Minor Changes

- 1559a62: CodeEditorField now binds to `y-codemirror.next` when a `<RecordCollabRoom>` is mounted up-tree (parallel to `@pilotiq/tiptap`'s collab plain-text path). Each `CodeEditorField` opens a doc-root `Y.Text` keyed by either the bare field name (top-level) or `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves). Opt out per-field with `.collab(false)`.

  Adds optional peer deps `y-codemirror.next ^0.3` + `yjs ^13` on `@pilotiq/codemirror` (under `peerDependenciesMeta.optional` — panels without `@pilotiq-pro/collab` installed continue to work as before).

  Also re-exports `useRowCoords`, `RowCoordsContext`, `parseRowFieldPath`, and `ParsedRowFieldPath` from `@pilotiq/pilotiq/react` so adapter packages (codemirror today, others later) can compose row-field collab keys consistently.

  **Relationship-row code editors:** `y-codemirror.next` binds against `Y.Text`, not `Y.XmlFragment`. `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` rekeys both share types alongside one another (`applyDelta(toDelta())` for `Y.Text`, `child.clone()` for `Y.XmlFragment`), so on PK-switch (UUID → DB PK after first save) a row-leaf `CodeEditorField`'s text content carries over to the new composite key on peer B without falling back to the DB column. Trade-off is rename-by-recreate (fresh CRDT identity → discards concurrent-edit history on the renamed row's code-editor leaves), same posture as the `Y.XmlFragment` branch. Requires `@pilotiq-pro/collab` ≥ the patch that ships this rekey (`pilotiq-pro@5fae624`, 2026-05-17).

## 3.0.1

### Patch Changes

- b14119e: Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

  Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.

## 3.0.0

### Patch Changes

- Updated dependencies [3b9d69c]
- Updated dependencies [e7f46a3]
- Updated dependencies [546b7bb]
- Updated dependencies [badb132]
- Updated dependencies [4440ec4]
  - @pilotiq/pilotiq@0.6.0

## 2.0.1

### Patch Changes

- 863505c: Use caret peer dep for `@pilotiq/pilotiq` so adapter packages stay compatible across minor bumps.

## 2.0.0

### Patch Changes

- Updated dependencies [a1c3e40]
  - @pilotiq/pilotiq@0.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [58232be]
- Updated dependencies [58232be]
- Updated dependencies [43428d6]
  - @pilotiq/pilotiq@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2dedc56]
  - @pilotiq/pilotiq@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies [8cea72c]
- Updated dependencies [786da6b]
- Updated dependencies [2f4c948]
- Updated dependencies [4bdae5d]
- Updated dependencies [e5cd3f1]
  - @pilotiq/pilotiq@0.1.0
