---
"@pilotiq/tiptap": minor
---

GitHub-style line-mode rendering for the AI inline diff. `startAiInlineDiff` / `applySurgicalAiInlineDiff` accept an optional `displayMode: 'inline' | 'lines'` — in `'lines'` mode every block touched by an insert renders as a full-width green row (`+` gutter) and deleted content renders as stacked red rows (`−` gutter) above the change, instead of the inline word-flow. `useAiInlineDiff` gained `resolveDisplayMode`, and all three editor surfaces (rich text, markdown, collab text) resolve it from a `data-ai-diff-view` wrapper marker — stamped by `@pilotiq-pro/ai`'s `Field.aiDiffView('lines')` setter. Default stays `'inline'`.
