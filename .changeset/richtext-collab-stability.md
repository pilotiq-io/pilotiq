---
'@pilotiq/tiptap': minor
---

fix(tiptap): RichTextField collab Y fragment now uses a row-id-anchored composite key inside Repeater / Builder rows

Mirrors the `MarkdownField` fix shipped in `@pilotiq/tiptap@3.9.0`. When `TiptapEditor` mounts inside a Repeater / Builder row (i.e. its `name` is a dotted positional path like `metadata.0.body` AND a `RowCoordsContext` is present), the editor now computes a stable composite key — `metadata.<rowId>.body` — and uses it for:

- `ydoc.getXmlFragment(...)` first-load seeding
- The collab extension factory's `fieldName` (Yjs collab scope per field)

`name` remains the positional FormData path everywhere else — AI suggestion routing (`useAiInlineDiff`, `useAiSuggestionBridge`), the inline-diff banner, mentions, and the hidden form input.

Different mechanics from the `MarkdownField` fix: `MarkdownField` has a textarea fallback path that needs the same composite, so the logic lived in `@pilotiq/pilotiq`'s `MarkdownInput` host. `RichTextField` has no fallback — pilotiq core dispatches the registered renderer directly — so the composite logic lives here, inside the only editor that needs it. `useRowCoords` + `parseRowFieldPath` are already exported from `@pilotiq/pilotiq/react`.

Latent bug, fixed preemptively: no consumer currently nests `RichTextField` inside a Repeater / Builder row, but if one did, row reorders would silently rebind the Y.XmlFragment to the wrong row's editor (the fragment key was the positional `metadata.<index>.body`, which shifts on reorder). AI suggestion routing was unaffected — positional names matched on both sides.
