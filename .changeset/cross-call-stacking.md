---
'@pilotiq/tiptap': minor
---

feat(tiptap): cross-tool-call stacking for surgical AI inline-diff ops

When a surgical AI suggestion arrives while an inline-diff review is already active for the same field, `useAiInlineDiff` now folds the new op into the active diff instead of stalling the suggestion in the queue.

Previously: the second suggestion sat in the queue until the user approved or rejected the first, then started its own diff afterwards. Worse, if the user clicked Accept while two were pending, the banner's "approve all" path dismissed both queue entries even though only the first had been applied — the second was silently dropped.

Now: the new modifier dispatches as a plain transaction; the extension's plugin folds the resulting steps into the running changeset, so:

- The banner shows the combined count (`"N changes suggested"`).
- Decorations update to cover both ops' ranges.
- Accept commits the union, Reject reverts to the original baseline captured when the first suggestion started the diff — semantically "reject all pending suggested changes", matching the banner copy.

Whole-field (non-surgical) suggestions still bail when a diff is active — replacing the entire doc on top of an active review would be too disruptive. That gap (whole-field stacking + silent-drop) remains a known issue, deferred until a consumer hits it.
