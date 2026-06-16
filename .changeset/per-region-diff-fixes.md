---
"@pilotiq/tiptap": patch
---

fix(inline-diff): correct two `aiDiffView('lines')` rendering bugs when an AI run stages multiple word-level edits (#191)

- A second changed word on the same block now highlights on the deleted (red) row too — the deleted-widget decoration key folds in the changed ranges, so a later region growing the spans rebuilds the widget instead of reusing a stale one keyed on text alone.
- Each per-region ✓/✕ control now anchors to its changed word on the added (green) row rather than floating to the deleted row — `DiffRegionControls` prefers the region's `inserted-line-changed` span and falls back to any anchor for pure block insert/delete.
