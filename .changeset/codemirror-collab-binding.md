---
'@pilotiq/codemirror': minor
'@pilotiq/pilotiq': minor
---

CodeEditorField now binds to `y-codemirror.next` when a `<RecordCollabRoom>` is mounted up-tree (parallel to `@pilotiq/tiptap`'s collab plain-text path). Each `CodeEditorField` opens a doc-root `Y.Text` keyed by either the bare field name (top-level) or `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves). Opt out per-field with `.collab(false)`.

Adds optional peer deps `y-codemirror.next ^0.3` + `yjs ^13` on `@pilotiq/codemirror` (under `peerDependenciesMeta.optional` — panels without `@pilotiq-pro/collab` installed continue to work as before).

Also re-exports `useRowCoords`, `RowCoordsContext`, `parseRowFieldPath`, and `ParsedRowFieldPath` from `@pilotiq/pilotiq/react` so adapter packages (codemirror today, others later) can compose row-field collab keys consistently.

**Relationship-row code editors:** `y-codemirror.next` binds against `Y.Text`, not `Y.XmlFragment`. `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` rekeys both share types alongside one another (`applyDelta(toDelta())` for `Y.Text`, `child.clone()` for `Y.XmlFragment`), so on PK-switch (UUID → DB PK after first save) a row-leaf `CodeEditorField`'s text content carries over to the new composite key on peer B without falling back to the DB column. Trade-off is rename-by-recreate (fresh CRDT identity → discards concurrent-edit history on the renamed row's code-editor leaves), same posture as the `Y.XmlFragment` branch. Requires `@pilotiq-pro/collab` ≥ the patch that ships this rekey (`pilotiq-pro@5fae624`, 2026-05-17).
