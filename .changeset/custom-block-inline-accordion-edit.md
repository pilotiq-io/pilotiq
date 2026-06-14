---
"@pilotiq/tiptap": minor
---

Custom blocks now edit inline (accordion) instead of in a right-docked side panel.

Clicking **Edit** on an inserted custom block (`Block.make().schema([...])`) expands the block in place and renders its schema as a `FormFields` form; edits write straight back onto the node via `updateAttributes({ blockData })` on every change — no popup, no save button.

This replaces the `BlockSidePanel` and removes the machinery that existed only to host the form outside the NodeView: the `onEdit` bridge + `Mod-e` shortcut on `BlockNodeExtension`, and the host-side `selectedBlock` state / position-remapping in `TiptapEditor`. The form lives in a `contentEditable=false` region with event guards so ProseMirror never treats the inputs as document content. Pure `coerceBlockValues` / `readBlockFieldValue` helpers moved to `react/blockValues.ts`.
