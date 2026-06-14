---
"@pilotiq/tiptap": patch
---

AI inline diff: the removed/deleted side now keeps its original block formatting (#91).

Previously the deleted content was flattened with `textBetween()` / `node.textContent`, so a removed heading, list, FAQ, or other formatted block rendered as plain text next to the (correctly-formatted) inserted side. The deleted widget now serializes the baseline's real nodes via the schema's `DOMSerializer` — a removed `<h2>` stays an `<h2>`, a list keeps its `<ul><li>`, a FAQ keeps its wrappers. A single plain top-level paragraph edit still renders as the inline word-level diff (no regression). Applies to both inline and `lines` display modes.
