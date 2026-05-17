---
'@pilotiq/pilotiq': patch
---

fix(repeater, builder): scope `draggable=true` to the grip, not the row container

Row reorder previously broke when row contents hosted a contenteditable (e.g. a Tiptap-backed `MarkdownField` / `RichTextField` inside a Repeater or Builder row): a mousedown starting inside the editor was absorbed for text-selection and the row's drag never fired. The grip `<span>` now carries `draggable=true` + `onDragStart`; the row container keeps only the drop-target handlers (`onDragOver` / `onDrop` / `onDragEnd`). `setDragImage(rowEl, 0, 0)` preserves the full-row drag preview.
