---
"@pilotiq/tiptap": minor
---

feat(tiptap): intra-line change highlight + refreshed diff palette in `aiDiffView('lines')` (#186)

The `lines` inline-diff mode now highlights the *changed characters* of a replaced line, GitHub-style. When a removed block is paired with a similar added block (e.g. an AI "fix grammar" edit), the two block texts are re-diffed at token granularity (new pure `wordDiff` module) and only the actually-edited substrings get a deeper tint — a background highlight, **not** bold. The added side highlights via inline decorations on the live doc; the removed side wraps the serialized red row. Unrelated replacements (low token overlap) and pure adds/deletes render as plain rows, unchanged.

The diff red/green palette is also refreshed from generic greens/reds to pilotiq-themed emerald (added) / rose (removed) — soft full-row tints with the deeper "changed" tint layered on top. Highlighting is gated to plain textblocks (paragraph/heading) where DOM text aligns with node text; content blocks with non-editable label chrome (FAQ/Alert/…) keep the existing whole-row behavior. No API change; `inline` mode is unaffected.
