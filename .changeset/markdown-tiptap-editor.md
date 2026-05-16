---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': minor
---

`MarkdownField` swaps its textarea + manual-toolbar UI for a real WYSIWYG editor when `@pilotiq/tiptap` is installed. The editor parses markdown into a Tiptap document, exposes a rich-text toolbar (bold / italic / strike / link / heading / lists / blockquote / code / attach files), and serializes back to markdown on every change via `tiptap-markdown`. Editor / Source / Preview tabs let users switch between WYSIWYG, raw markdown, and a rendered preview.

Collab is automatic — when a `<RecordCollabRoom>` is up-tree the editor binds to the shared `Y.XmlFragment` the same way `RichTextField` does. All peers see live edits; only the local serialize-to-markdown runs per peer.

Wire format unchanged — a plain markdown string under the field name. Panels that don't install `@pilotiq/tiptap` keep the textarea fallback.

New public API in pilotiq core:

- `registerMarkdownEditor(C) / getMarkdownEditor()` + `MarkdownEditor / MarkdownEditorProps` types — re-exported from `@pilotiq/pilotiq/react`.

New in `@pilotiq/tiptap`:

- `MarkdownEditor` component, auto-registered by `registerTiptap()` / `tiptap()` plugin.
- `tiptap-markdown@^0.9` peer dep.
