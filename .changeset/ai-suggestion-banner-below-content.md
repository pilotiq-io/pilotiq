---
'@pilotiq/tiptap': patch
---

fix(ai): move `AiSuggestionBanner` from above the toolbar to below the editor content

The Accept / Reject strip for whole-field AI suggestions on `RichTextField` and `MarkdownField` previously mounted at the top of the editor wrapper, above the toolbar. That position pushed the toolbar and content down on every suggestion arrival, shifting the writing surface mid-edit and competing with the toolbar for the user's attention.

The banner now mounts below `<EditorContent>` (after all tab content in `MarkdownEditor`, so the position is uniform across editor/source/preview tabs). The CSS margin flipped from `margin-bottom` to `margin-top` so the banner has breathing room from the content above it instead of the chrome below.

Behavior is unchanged — same Accept / Reject handlers, same diff-active vs whole-field branching, same per-suggestion stacking semantics.
