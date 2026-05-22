---
'@pilotiq/tiptap': patch
---

fix(collab): mirror markdown editor into the FormData hidden input after first sync

Third symmetric application of the subscribe-after-sync mirror — `MarkdownEditor` had the same gap as `TiptapEditor` and `CollabTextRenderer`. The wrapping host (`MarkdownEditorHost` in pilotiq core) drives a hidden FormData input from React state populated ONLY through the editor's `onChange` callback. In the cold-mount case (a fresh peer joining a populated doc) y-prosemirror's `ySyncPlugin` view-hook `_forceRerender` could land before the React owner installed the `update` listener — leaving the hidden input at its SSR-rendered `defaultValue` through to submit.

The `useCollabSeed` callback now serializes the editor's markdown via `editor.storage.markdown.getMarkdown()` and fires `onChange(md)` after `room.synced` resolves, alongside the existing empty-fragment seed branch. Idempotent — when `onUpdate` already propagated the value, this is a no-op `setText(sameValue)`.

Sister audit on `@pilotiq/codemirror`'s `CollabCodeMirrorEditor` came back clean: that path already reads `yText.toString()` synchronously in its mount effect and propagates via `setText`, so the catch-up is built into the codemirror branch.
