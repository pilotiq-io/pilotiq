---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap':  patch
---

feat(pilotiq, tiptap): auto-upgrade `TextField` / `TextareaField` to the Tiptap-backed editor when AI agents are attached (no collab required)

Previously, the Tiptap-backed renderer (`CollabTextRenderer` in `@pilotiq/tiptap`) only mounted when a `<RecordCollabRoom>` was active — so AI suggestions on plain (non-collab) `TextField` / `TextareaField` fell back to the legacy DOM-write overlay, with no inline-diff chip widget.

The rule is now: a text-like field gets the Tiptap surface if **any one of**:

1. A collab room is active (existing behavior — cursor preservation under concurrent edits).
2. AI agents are attached via `field.ai([…])` (new — the inline-diff chip needs a ProseMirror surface to render).
3. The field is a `MarkdownField` (existing — always Tiptap).

`TextLikeInput` widens its routing gate from `room && collabRenderer …` to `(room || hasAi) && collabRenderer …`. `FieldShell` mirrors the widening so its legacy overlay + DOM-write applier stay out of the way when the Tiptap bridge owns the surface. `CollabTextRenderer` already handles `useCollabRoom() === null` — it just mounts the editor without the Yjs Collaboration extension, so this widening doesn't force a collab room.

No new public API. Users get the auto-upgrade for free by attaching agents — exactly what they already do to opt into AI features on a field.

**`@pilotiq/tiptap` follow-on:**

- `CollabTextRenderer` now sets `immediatelyRender: false` on the editor config. Pre-rule-#2 the host's `TextLikeInput` gated on a live collab room (client-only state), so SSR fell through to the native input and the editor never constructed server-side. With AI-attached fields now SSR-rendering Tiptap, `useEditor` would throw `"Tiptap Error: SSR has been detected, please set immediatelyRender explicitly to false"` on the first direct-navigation request. The flag defers construction to the first React effect — empty shell on SSR, live editor on hydration.
- Build script no longer ships `dist/markdownExtension.js.map`. The bundled file is 371 KB of inlined `tiptap-markdown` + `markdown-it` chain; the sourcemap from `tsc` only described the original ~20-line wrapper, leaving Vite to log a `Sourcemap … points to missing source files` warning on every consumer dev boot.

**Inline-diff chip visualization extended to MarkdownEditor + TiptapEditor.** Both now opt into `synthesizeWholeFieldRange` so chat-driven whole-field suggestions (`update_form_state`'s `set_value`) render the chip widget over the whole doc. The bridge tracks synthesized ids in a separate set: on Approve, *producer-supplied* range hits the editor's `approveAiSuggestion` (text-node replace, surgical), while *synthesized* whole-doc range delegates to the renderer's `onApplyWholeField` (`setContent(...)`) and clears the chip with a no-op reject. Without this split, approving a synthesized chip on richtext / markdown would do a plain-text replace and clobber all formatting; without the synthesis, the user saw no visualization at all on richtext / markdown.
