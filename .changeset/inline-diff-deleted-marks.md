---
"@pilotiq/tiptap": patch
---

Inline diff: preserve inline marks on the deleted (red) side

The deleted side of a whole-field AI inline diff now keeps its inline formatting (bold / italic / link / code) instead of flattening to plain text. Previously the single-paragraph branch of the deleted widget extracted the old text via `node.textContent`, dropping every mark, so a removed `<strong>`/`<em>`/`<a>` run rendered as plain struck text while the inserted side stayed formatted — the diff read as broken. The deleted run is now serialized through the schema's `DOMSerializer` (inline content only, so the inline look is kept), matching the inserted side.

Also documents a known limitation: a formatting-only change (same text, a mark toggled) is not surfaced, because `prosemirror-changeset` is driven by step position maps and mark steps have identity maps.
