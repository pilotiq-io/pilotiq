---
'@pilotiq/codemirror': minor
'@pilotiq/pilotiq': minor
---

CodeEditorField now binds to `y-codemirror.next` when a `<RecordCollabRoom>` is mounted up-tree (parallel to `@pilotiq/tiptap`'s collab plain-text path). Each `CodeEditorField` opens a doc-root `Y.Text` keyed by either the bare field name (top-level) or `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves). Opt out per-field with `.collab(false)`.

Adds optional peer deps `y-codemirror.next ^0.3` + `yjs ^13` on `@pilotiq/codemirror` (under `peerDependenciesMeta.optional` — panels without `@pilotiq-pro/collab` installed continue to work as before).

Also re-exports `useRowCoords`, `RowCoordsContext`, `parseRowFieldPath`, and `ParsedRowFieldPath` from `@pilotiq/pilotiq/react` so adapter packages (codemirror today, others later) can compose row-field collab keys consistently.

**Known caveat (relationship-row code editors):** `y-codemirror.next` binds against `Y.Text`, not `Y.XmlFragment`. `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` only rekeys `Y.XmlFragment` shares today, so on PK-switch (UUID → DB PK after first save) a row-leaf `CodeEditorField`'s text content does not carry over to the new composite key on peer B — peer B re-seeds from the DB column on next mount. Top-level code-editor fields and freshly-created row code-editors (within a single peer session) are unaffected. Tracked as a pilotiq-pro follow-up: parallel `Y.Text` clone branch in `renameRow`.
