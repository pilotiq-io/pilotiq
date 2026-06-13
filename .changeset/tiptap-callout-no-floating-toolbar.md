---
"@pilotiq/tiptap": patch
---

Don't show the inline mark toolbar inside the callout (alert) block.

The selection-based `FloatingToolbar` (bold / italic / strike / code / link) was appearing when text was selected inside an `alert` block, even though the callout owns its own content + chrome through the in-block gear menu (#155). Its `shouldShow` now bails when either selection endpoint sits inside an `alert` at any ancestor depth.
