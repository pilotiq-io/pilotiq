---
"@pilotiq/tiptap": minor
---

Render the `keyTakeaways` and `summary` content blocks **labelless**. The built-in, fixed-English "Key takeaways" / "Summary" / "In summary" labels are removed so the section heading can live ABOVE the block as a localized, editable `<h2>` (matching the `faq` block, which never had a baked-in label). This is what lets the AI block agents place a heading in the article's own language instead of a hardcoded English one.

The `.pilotiq-block-content` wrapper, in-block gear menu, width toggle, and the summary `variant` attr (+ its `data-variant` styling hook used for placement and the article accent) are all preserved — only the `.pilotiq-block-label` line is gone. `intro` (already `plain`) and `alert` / `prosCons` are unchanged.
