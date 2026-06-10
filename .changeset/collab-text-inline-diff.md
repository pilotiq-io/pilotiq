---
"@pilotiq/tiptap": minor
---

`CollabTextRenderer` (the Tiptap surface behind collab/AI `TextField` / `TextareaField`) now renders whole-field AI suggestions through `AiInlineDiffExtension` + `AiSuggestionBanner` — the same red/green inline diff and amber Accept/Reject banner `RichTextField` uses — instead of the legacy green-pill chip with ✓/✕. One review surface across every text shape. The chip bridge stays mounted for producer-supplied `editorRange` suggestions; `onApplyWholeField` remains the fallback when a suggestion can't parse.
