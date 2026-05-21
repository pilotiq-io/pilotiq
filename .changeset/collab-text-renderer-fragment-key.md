---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': minor
---

fix(collab-text): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the plain-text collab renderer

Audit catch from the same family as the `MarkdownEditor` fix in `@pilotiq/pilotiq@0.20.0` / `@pilotiq/tiptap@3.9.0`. The `CollabTextRenderer` (Tiptap-backed plain-text editor used by collab-enabled `TextField` / `TextareaField` / `MarkdownField`'s collab fallback) had the same single-prop / two-concerns shape:

- `TextLikeInput.tsx → CollabTextField` and `MarkdownInput.tsx → MarkdownCollabInput` both overrode the renderer's `name` with the composite row-id fragment key — needed for `Y.XmlFragment` stability under reorders — but that override ALSO re-keyed AI suggestion routing (`useAiSuggestionBridge`), so the chip-widget surface on a plain `TextField` nested in a Repeater row would never receive AI suggestions addressed by the positional FormData name (`metadata.0.title`).

Fix: `CollabTextRendererProps` now carries an optional `fragmentKey`. `CollabTextRenderer` uses `fragmentKey ?? name` for the collab factory `fieldName` + first-load `ydoc.getXmlFragment(...)` seed only; AI suggestion bridge + form integration stay on `name`. Both host wrappers pass `name={hiddenInputName}` (positional FormData path) and `fragmentKey={composite}` (row-id-anchored) when the two differ; top-level fields omit `fragmentKey` and keep today's behavior.

Latent bug, fixed preemptively: AI tool calls on plain `TextField` nested in a Repeater / Builder row would silently fail to render their inline-diff chip — same root cause as the `MarkdownField` bug in `@pilotiq/tiptap@3.8.0` and below, just for the chip-widget surface instead of the inline-diff overlay.

All 16 collab e2e tests + 4 AI surgical e2e tests pass against the change.
