---
'@pilotiq/tiptap': minor
---

feat(tiptap): auto-mode applier for surgical AI inline-diff ops

`useAiInlineDiff`'s registry applier now handles two paths:

1. **Review accept (existing).** Suggestion was already started via `startAiInlineDiff` / `applySurgicalAiInlineDiff`; approve runs `acceptAiInlineDiff()`.
2. **Auto-mode direct apply (new).** Suggestion arrives at the applier with `meta.surgical` but was never started (the producer bypassed the queue). The hook plans the same modifier the diff path uses and dispatches it as a plain transaction — no diff overlay, no Accept / Reject step.

Mirrors the existing `set_value` auto-mode behaviour, where the AI tool binding calls the applier directly with a synthesized suggestion to skip the review queue. Surgical ops in `Pilotiq.aiSuggestionsMode('auto')` now write through immediately instead of always waiting on the user.

Review-mode behaviour unchanged.
