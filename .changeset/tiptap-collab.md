---
'@pilotiq/tiptap': minor
---

feat(tiptap): collab-aware editor via pilotiq's collab registries

`TiptapEditor` now plugs into `@pilotiq/pilotiq`'s `CollabRoomContext`
and `CollabExtensionFactory` registry — when a `<RecordCollabRoom>` is
mounted up-tree AND a plugin (e.g. `@pilotiq-pro/collab`) has registered
extensions, the editor attaches to the room and uses the field's name as
the `Y.XmlFragment` selector. Multiple `RichTextField`s on one record
share ONE Y.Doc + ONE WebSocket connection — mirrors Tiptap's
"Collaborative Fields" experiment.

### Behavior

- **Remount on collab toggle.** A `CollabAwareTiptap` shell reads the
  room + factory and keys `ClientEditor` on `collabActive ? 'collab' :
  'local'`. Tiptap can't swap `Collaboration` at runtime, so the keyed
  remount handles the room-attaches-after-mount case cleanly.
- **History disabled when collab is active.** Yjs ships its own undo
  manager via `Collaboration`; StarterKit's `undoRedo` extension is
  disabled in the collab branch to avoid two stacks fighting.
- **First-load seed.** After `provider.synced` fires, if the field's
  Y.XmlFragment is empty AND `defaultValue` looks like a Tiptap doc
  (`isTiptapShapedContent` guard), seed once via
  `editor.commands.setContent`. Subsequent joiners find the fragment
  populated and skip.
- **Lexical-shape guard.** Existing rows holding old Lexical-format JSON
  (`{ root: {...} }`) no longer crash the editor — the same guard skips
  the parse so the editor mounts empty instead.
- **Per-field opt-out.** `RichTextField.make('private').collab(false)`
  stamps `meta.collab === false`; the renderer skips the collab
  extensions even with a room mounted. (`.collab()` itself lives on the
  `Field` base in `@pilotiq/pilotiq`; this PR only wires the renderer.)

### Cosmetics

- Field container `<div>` lost `gap-1` — collab cursors render flush
  against the editor frame now.

### Required peers (when collab is in use)

`@pilotiq/tiptap` itself takes no new peer deps — the collab factory is
opaque `unknown[]`. The pro consumer (`@pilotiq-pro/collab`) declares
`@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-caret`
peers + ships the Yjs runtime.
