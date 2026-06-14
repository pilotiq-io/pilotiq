---
"@pilotiq/tiptap": patch
---

Inline format toolbar visibility fixed for block nodes (#155).

Two adjustments to `shouldShowFloatingToolbar`:

- **Hidden on a whole-node block selection.** Clicking a schema-form custom block card (`pilotiqBlock`), an image, an hr, or picking a whole Alert via the drag handle produces a `NodeSelection` with no inline text to format — the bold/italic/link toolbar no longer appears for any of these. Previously only the built-in `alert` block was special-cased, so custom block cards still surfaced the toolbar.
- **Shown inside the Alert block's editable text.** The Alert block has an editable title and body; the mark toolbar now works there like anywhere else. An earlier fix over-suppressed the entire Alert (including its editable text) — that suppression is reversed; only the whole-node pick is hidden now.
