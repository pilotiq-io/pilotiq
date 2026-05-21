---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': minor
---

fix(markdown): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the markdown editor

`MarkdownEditorProps` previously had a single `name` prop that drove both the FormData hidden input + AI suggestion routing AND the `Y.XmlFragment` key. Inside a Repeater / Builder row, `MarkdownInput` overrode `name` with a row-id-anchored composite (`metadata.<rowId>.body`) so the Y fragment survived row reorders — but this also re-keyed the AI applier registry and `<AiSuggestionBanner>`, so tool calls that referenced the field by its dotted FormData name (`metadata.0.body`) never reached the row editor.

Result: AI surgical / whole-field suggestions on a `MarkdownField` nested inside a Repeater row silently failed — the tool reported "queued for review" but no diff overlay appeared in the row.

Fix: `MarkdownEditorProps` now carries a separate optional `fragmentKey` prop. The editor uses it for the collab Y fragment key (`ydoc.getXmlFragment(...)` + the collab factory's `fieldName`) but keeps `name` for everything else — AI suggestion routing, applier registry, hidden FormData input, inline-diff banner. Top-level fields omit `fragmentKey`; row leaves pass the composite as `fragmentKey` while leaving `name` as the dotted FormData path.

`@pilotiq/tiptap`'s `MarkdownEditor` accepts the new prop and routes it correctly. `@pilotiq/pilotiq`'s `MarkdownInput` passes both props to the registered editor.

Caveat: `RichTextField`'s `TiptapEditor` has the analogous single-`name` shape and would surface the same gap if nested in a Repeater. Not in scope for this change — no consumer currently nests `RichTextField` in a row. File a follow-up when it becomes a real path.
