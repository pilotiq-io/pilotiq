---
"@pilotiq/pilotiq": patch
---

`MarkdownField` instances inside `Repeater` / `Builder` rows now mount the registered WYSIWYG editor (e.g. `@pilotiq/tiptap`'s `MarkdownEditor`) instead of falling back to the legacy collab plain-text editor. Threads the row-id-anchored composite key (`${arrayName}.${rowId}.${fieldName}`) to the editor's collab factory via a new `collabKey` prop on the host, while keeping the original dotted `name` for hidden-input form submission. Brings WYSIWYG editing parity to row-leaf markdown fields with no change to the on-the-wire shape.
