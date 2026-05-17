---
'@pilotiq/codemirror': patch
---

fix(codemirror): seed editor doc from `yText.toString()` at mount so collab remounts onto a populated `Y.Text` paint immediately

When `CollabCodeMirrorEditor` remounts (e.g. after a Repeater/Builder row's PK switch re-keys the row's CRDT identity from UUID to DB PK), the new `EditorView` was constructed with `doc: ''` on the assumption that `y-codemirror.next`'s `ySyncPlugin` would pull pre-existing `Y.Text` content into the editor at attach time. It doesn't — the plugin assumes editor doc + `Y.Text` are already in sync at init and only observes subsequent deltas. So a fresh editor against a `Y.Text` that already had content would paint blank until someone typed and triggered an observed delta.

Seeding `doc` from `yText.toString()` at construction time is enough: the plugin's first observation runs against editor doc + `Y.Text` both holding the same content (no diff to dispatch), and subsequent edits propagate as before. No double-insert risk — the plugin doesn't try to re-insert content already present in the editor doc.

Fixes the row-leaf `CodeEditorField` survives-PK-switch case in `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` `Y.Text` rekey path (pilotiq-pro@5fae624). The renameRow side was already broadcasting the cloned content correctly; the consumer-side editor just wasn't reading it on remount.
