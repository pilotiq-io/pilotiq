---
"@pilotiq/tiptap": minor
---

Add `SuggestionReviewPopover` — a single floating popover wizard that steps through pending inline-diff suggestions one at a time, replacing the scattered per-region ✓/✕ overlay. The popover anchors to each suggestion's DOM element, shows a step counter (`1 of 3`), a before/after text preview, and Accept/Reject buttons that advance to the next suggestion automatically. Clicking a diff region in the editor jumps the popover to that suggestion. Dismiss (×) collapses the card without resolving. `DiffRegionControls` remains exported for backward compatibility but is no longer used internally.
