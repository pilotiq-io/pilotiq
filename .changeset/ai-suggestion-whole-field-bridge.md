---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap':  minor
---

fix(pilotiq, tiptap): route AI suggestions through the Tiptap bridge for collab-on / markdown / richtext fields — fixes chat-driven `update_form_state` no-op

Two cooperating bugs left chat-sidebar Approve doing nothing on Tiptap-backed fields:

1. **`FieldShell` overlay shadowed the bridge.** The gate `isRichText = fieldType === 'richtext'` ran the legacy overlay UI on `markdown` / `text` / `textarea`, *and* registered a generic DOM-write applier that overwrote the Tiptap bridge's applier in the registry (parent effect runs after children). Approve set the hidden `<input>`'s `.value`, which the Tiptap editor never observes, so the visible content never changed.

2. **Bridge skipped whole-field suggestions.** `useAiSuggestionBridge` only pushed entries with `meta.editorRange = { from, to }` into the editor. Chat-agent producers like `@pilotiq-pro/ai`'s `update_form_state` tool target the whole field — no range — so suggestions sat in the queue with no chip widget and no applier path.

Fix:

- **`@pilotiq/pilotiq`** — `FieldShell` widens `isRichText` to `isTiptapMounted`: `richtext` always, `markdown` when a `MarkdownEditor` is registered, `text` / `textarea` when both a `CollabTextRenderer` is registered and `useCollabRoom()` resolves a room. Hides the legacy overlay and skips DOM-write applier registration so the bridge's editor-driven applier owns the surface.

- **`@pilotiq/tiptap`** — `useAiSuggestionBridge` accepts a new `onApplyWholeField(value)` option. When Approve fires for a non-bridge-pushed id, the bridge calls this callback instead of no-op'ing. Each renderer passes its own implementation:
  - `CollabTextRenderer` → `editor.commands.setContent(plainTextToDoc(value, multiline))` — y-prosemirror syncs the resulting transaction to peers when collab is on.
  - `MarkdownEditor` → `editor.commands.setContent(value)` — the Markdown extension parses the raw source.
  - `TiptapEditor` (RichTextField) → `editor.commands.setContent(value)` — HTML / JSON.

After the fix every chat-driven `update_form_state` set-value lands on the visible editor surface across all three Tiptap mounts. Range-anchored suggestions (existing chip-widget path) keep their original behavior unchanged.

**Plus inline-diff visualization for whole-field suggestions.** Two follow-on improvements in `@pilotiq/tiptap`:

- `useAiSuggestionBridge` accepts `synthesizeWholeFieldRange(editor, suggestion) => { from, to } | undefined`. When opted in, whole-field suggestions get a synthesized range and the inline-diff chip widget renders BEFORE the user approves (red strikethrough on the current value + green chip with the suggested text + ✓/✕ buttons). `CollabTextRenderer` opts in with `{ from: 0, to: editor.state.doc.content.size }` — its plain-text schema accepts the extension's text-node replacement on Approve cleanly. `MarkdownEditor` and `TiptapEditor` abstain (they'd lose formatting on the chip-driven approve) and continue to use the silent `onApplyWholeField` fallback.

- `AiSuggestionExtension` injects minimal default styles into `<head>` on first mount (idempotent via a `data-pilotiq-ai-suggestion-styles` sentinel). Consumers no longer need to wire CSS for the chip — they see the visualization out of the box. User stylesheets still override since they cascade after the injected `<style>` block, and the class names (`pilotiq-ai-suggestion-original` / `-chip` / `-replacement` / `-accept` / `-reject`) stay the documented surface for customization.
