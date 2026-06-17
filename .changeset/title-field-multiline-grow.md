---
"@pilotiq/pilotiq": patch
---

Title (and other single-line collab/AI) fields grow to fit wrapped content

The Tiptap-backed single-line text field (used when a field has AI agents or a collab room attached) was chromed for a strict one line: a fixed `h-8` height, `items-center`, and `whitespace-nowrap overflow-x-clip`. When a long title wrapped to a second line the box looked cramped and the padding/line-height no longer matched the content. The variant now grows gracefully — `min-h-8` keeps the compact resting height for short titles, while `whitespace-pre-wrap break-words` + balanced `py-1.5` / `leading-snug` let the border hug multi-line content. Both axes stay `overflow: visible`, so the collaboration caret's presence label still renders above the line.
