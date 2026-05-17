# @pilotiq/codemirror

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
