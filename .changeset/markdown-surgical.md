---
'@pilotiq/tiptap': minor
---

feat(tiptap): surgical AI inline-diff ops now support markdown fields

`planReplaceBlock` and `planInsertBlockBefore` now auto-detect markdown editors by sniffing for the `tiptap-markdown` extension's `storage.markdown.parser`:

- **Richtext (`RichTextField` / `TiptapEditor`)** — unchanged. `content` is HTML and parses through `DOMParser.fromSchema(...).parseSlice(...)` directly.
- **Markdown (`MarkdownField` / `MarkdownEditor`)** — new. `content` is markdown source; the planner runs it through the markdown-it parser bundled with `tiptap-markdown` to produce HTML first, then parses that as a Slice.

Mirrors the same auto-detect strategy `MarkdownEditor.tsx` already uses for whole-field `parseSuggestion` callbacks, so surgical ops on markdown fields now share the same content-handling path as the existing whole-field replacement path.

Closes follow-up #4 of the surgical block ops shipped in `@pilotiq/tiptap@3.7.0`.
