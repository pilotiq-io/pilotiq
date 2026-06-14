---
"@pilotiq/tiptap": major
---

Rename the AI suggestion/diff primitives to provider-neutral names. These are generic inline-diff machinery the package exposes — they contain no AI logic and can be driven by any producer (the actual AI lives in `@pilotiq-pro/ai`), so the `Ai*` prefix oversold them.

**Renamed exports** (no aliases — direct importers must update):

| Old | New |
|---|---|
| `AiSuggestionExtension` | `SuggestionChipExtension` |
| `AiSuggestion` | `InlineSuggestion` |
| `AiSuggestionExtensionOptions` | `SuggestionChipExtensionOptions` |
| `aiSuggestionPluginKey` | `suggestionChipPluginKey` |
| `useAiSuggestionBridge` | `useSuggestionBridge` |
| `AiInlineDiffExtension` | `InlineDiffExtension` |
| `AiInlineDiffExtensionOptions` | `InlineDiffExtensionOptions` |
| `aiInlineDiffPluginKey` | `inlineDiffPluginKey` |
| `getAiInlineDiffState` | `getInlineDiffState` |
| `AiDiffDisplayMode` | `DiffDisplayMode` |
| `useAiInlineDiff` / `useIsAiInlineDiffActive` / `readAiDiffViewMarker` | `useInlineDiff` / `useIsInlineDiffActive` / `readDiffViewMarker` |
| `AiSuggestionBanner` / `useAiSuggestionBanner` | `SuggestionBanner` / `useSuggestionBanner` |

**Renamed editor commands**: `addAiSuggestion` → `addSuggestion`, `approveAiSuggestion` → `approveSuggestion`, `rejectAiSuggestion` → `rejectSuggestion`, `approveAllAiSuggestions` → `approveAllSuggestions`, `rejectAllAiSuggestions` → `rejectAllSuggestions`, `clearAiSuggestions` → `clearSuggestions`; `startAiInlineDiff` → `startInlineDiff`, `applySurgicalAiInlineDiff` → `applySurgicalInlineDiff`, `acceptAiInlineDiff` → `acceptInlineDiff`, `rejectAiInlineDiff` → `rejectInlineDiff`.

**Renamed CSS classes / DOM markers** (consumers with custom stylesheets must update; the injected defaults follow the new names automatically): `pilotiq-ai-suggestion-*` → `pilotiq-suggestion-*`, `pilotiq-ai-banner-*` → `pilotiq-suggestion-banner-*`, `pilotiq-ai-diff-*` → `pilotiq-diff-*`, and the matching `data-pilotiq-ai-*` attributes → `data-pilotiq-*`.

**Deliberately unchanged**: the cross-package field-config markers `data-ai-suggestions-mode` / `data-ai-diff-view` (written by `@pilotiq-pro/ai`'s `.aiSuggestionsMode()` / `.aiDiffView()` field API) stay `ai`-prefixed — they configure genuinely AI-specific behavior, not provider-neutral primitives.
