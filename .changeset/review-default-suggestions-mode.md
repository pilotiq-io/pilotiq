---
"@pilotiq/pilotiq": minor
---

`aiSuggestionsMode` now defaults to `'review'` — AI-driven field writes stage an Accept/Reject overlay unless the panel explicitly opts into `'auto'`. Consent-by-default: silent form mutation is the surprising behavior, so it's the one that requires opting in. `panelInfo()` emits the mode sparsely when it equals the new default; `AppShell` falls back to `'review'` when absent. Panels that want the old behavior call `Pilotiq.aiSuggestionsMode('auto')` (or pass `suggestionsMode: 'auto'` to `@pilotiq-pro/ai`'s plugin options).
