---
"@pilotiq/tiptap": patch
---

fix(tiptap): custom blocks no longer vanish on edit under realtime collab (#96)

Opening a custom block's inline accordion editor under collab silently deleted the block. The accordion renders the block's `Block.schema([...])` via `<FormFields>`, and inside a `<RecordCollabRoom>` its text inputs were being rendered as **collab-bound** fields — each mounting its own `Y.XmlFragment` (`TextLikeInput` → `CollabTextRenderer`). Mounting that nested collab field fired the host editor's collab reconcile (`_forceRerender`), which rebuilt the document from Yjs and dropped the custom block.

The accordion edits the node's local `blockData` attr, not the surrounding record's collab document, so its fields must never be collab-bound. `BlockNodeView` now shadows the room context with `<CollabRoomContext.Provider value={null}>` around the form, so `useCollabRoom()` returns null for the block's fields and they render as plain inputs — no nested `Y.XmlFragment`, no reconcile, no lost block.
