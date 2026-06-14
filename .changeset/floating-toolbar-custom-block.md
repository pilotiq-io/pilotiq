---
"@pilotiq/tiptap": patch
---

Inline format toolbar no longer appears when a whole-node block is selected (#155).

`shouldShowFloatingToolbar` previously only suppressed the toolbar for the built-in `alert` block, so clicking a schema-form custom block card (`pilotiqBlock`), an image, or a horizontal rule produced a `NodeSelection` that still surfaced the bold/italic/link toolbar — even though there is no inline text to format. The predicate now hides the toolbar for any `NodeSelection` on a non-text block.
