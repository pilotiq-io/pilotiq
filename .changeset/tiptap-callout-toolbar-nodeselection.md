---
"@pilotiq/tiptap": patch
---

Also hide the inline mark toolbar when the whole callout block is "picked".

Follow-up to the previous callout fix (#155): the `FloatingToolbar` still appeared when the entire `alert` block was selected via the drag handle, because that is a `NodeSelection` whose `$from` resolves to *before* the node — so walking ancestors from `$from` never sees the `alert`. The alert-detection is now an exported `isSelectionInAlert(selection)` predicate that handles both a text/range selection inside the alert AND a whole-block `NodeSelection` on it, pinned by `contentBlockAlertSelection.dom.test.ts` against the real schema (including a real `NodeSelection` on the alert).
