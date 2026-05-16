---
"@pilotiq/tiptap": patch
---

Fix Tiptap v3 SSR crash in `MarkdownEditor` under Vike. Sets `immediatelyRender: false` so the editor defers DOM construction until the first React effect; SSR renders an empty shell and hydration mounts the live editor.
