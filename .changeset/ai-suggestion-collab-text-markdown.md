---
'@pilotiq/tiptap': minor
---

fix(tiptap): mount `AiSuggestionExtension` + `useAiSuggestionBridge` in `CollabTextRenderer` and `MarkdownEditor`

The cross-package AI suggestion plumbing (extension + host bridge to `<PendingSuggestionsContext>`) was wired into `TiptapEditor` (RichTextField) but missing from the other two Tiptap-backed editors:

- `CollabTextRenderer` — the Tiptap-backed plain-text path used by `TextField` and `TextareaField` when collab is on.
- `MarkdownEditor` — `MarkdownField`'s editor surface.

`editor.commands.addAiSuggestion(...)` was a no-op on those fields. Now every Tiptap mount across the adapter participates in suggestion mode uniformly — same wire-shape ids, same Approve / Reject chip widgets, same dismissal lifecycle as the rich-text path.

No host changes required — the bridge reads the field name from the props the renderers already accept.
