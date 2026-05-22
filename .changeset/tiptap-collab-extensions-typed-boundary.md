---
'@pilotiq/tiptap': patch
---

refactor(tiptap): narrow `collabExtensions` + `initialContent` at the typed boundary

`TiptapEditor` and `MarkdownEditor` previously cast the collab-extension array as `any[]` at the spread site (`...(collabExtensions as any[])`) even though the produced array is `AnyExtension[]`-shaped. Adding `import type { AnyExtension, Content } from '@tiptap/core'` lets us type the `useMemo` directly and narrow `editor.commands.setContent(initialContent as Content)` instead of bypassing the type system entirely.

`initialContent` is already gated by `isTiptapShapedContent(...)` upstream — the explicit `as Content` cast documents what we expect at the call site rather than papering over with `as any`. No behavior change; tests 193/193.

The `room as unknown as FrameworkCollabRoom` casts on `CollabTextRenderer` / `CollabCodeMirrorEditor` are deliberate framework-room boundary casts and stay as-is.
