---
'@pilotiq/tiptap': minor
---

feat(tiptap): inline-diff visualization + banner UX for whole-field AI suggestions on RichTextField and MarkdownField

The chip widget path (`AiSuggestionExtension`) keeps its role for *surgical* range-anchored suggestions (`format_text`, `set_link`, `insert_paragraph`, …) — those have a precise location worth visualizing inline. For whole-field replacements from chat-driven `update_form_state` / `set_value` calls, the chip's `textContent` render surfaced raw markup as literal text inside the green pill — visually unparseable on multi-paragraph rewrites.

Two new pieces in `@pilotiq/tiptap`:

1. **`AiInlineDiffExtension` + `useAiInlineDiff` hook** — Tiptap-Pro-class inline-diff visualization driven by [`prosemirror-changeset`](https://github.com/ProseMirror/prosemirror-changeset). The hook watches `<PendingSuggestionsContext>` for whole-field suggestions, runs the renderer-supplied parser (`tiptap-markdown.parser.parse(value)` → HTML → `ProseMirrorDOMParser.parseSlice` for markdown / direct DOMParser for richtext), and calls `editor.commands.startAiInlineDiff(id, slice)`. The extension snapshots the current doc as the baseline, replaces the doc body with the proposed slice, and initializes a changeset tracking the diff. Decorations render:
   - Green-background `<span>` over inserted ranges (current doc).
   - Strikethrough widget at the insert anchor showing the *deleted* text in red — the deleted content isn't in the current doc, so a widget is the only way to surface it.
   - `acceptAiInlineDiff()` clears the diff state (current doc IS the accepted state). `rejectAiInlineDiff()` reverts the doc to the captured baseline. Both commands are public and the host's banner drives them.

2. **`<AiSuggestionBanner>` host component** — a top-of-editor strip that mounts above the editor when whole-field suggestions are pending. Replaces the chip path for richtext / markdown surfaces (which always had ugly raw-markup chips). Two modes:
   - Default (no diff): Accept routes through the renderer-supplied `onApplyWholeField(value)`, mirroring the previous chip-Approve semantics for plain text fallback.
   - Diff-active: `onAcceptViaEditor` / `onRejectViaEditor` props route through the extension's commands so the doc commits / reverts cleanly.

Default CSS for both the banner chrome and the diff decorations auto-injects on first mount (idempotent via sentinels), so consumers see the visualization out of the box. Class names (`pilotiq-ai-banner-*` + `pilotiq-ai-diff-*`) stay the documented surface for theme customization.

`MarkdownEditor` and `TiptapEditor` mount the new extension + banner; `CollabTextRenderer` keeps the chip path (plain-text replacement renders cleanly in the chip).

Wire shape unchanged on the host side — `@pilotiq-pro/ai`'s `update_form_state` → `set_value` tool keeps emitting a single `suggestedValue` string. The renderer-supplied parser decides what to do with it.
