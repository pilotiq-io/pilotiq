---
"@pilotiq/tiptap": patch
---

Fix inline diff regions not reverting when rejected from the pending-suggestions pill. The context→editor cleanup in `useInlineDiff` now calls `rejectInlineDiffRegion` when a suggestion is dismissed externally (e.g. via the chat sidebar pill), so the editor's green/red highlights revert correctly instead of remaining as orphaned regions.
