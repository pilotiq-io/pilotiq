---
'@pilotiq/pilotiq': minor
'@pilotiq/tiptap': patch
---

fix(ai): scope inline-diff + chip suggestion appliers by surrounding form id

Multi-form pages would route AI suggestions to whichever editor mounted last because both `useAiInlineDiff` and `useAiSuggestionBridge` hard-coded `formId: undefined` when registering their applier — so two editors sharing a field name across forms (e.g. a "summary" `RichTextField` in the main edit form + the same field in a Replicate modal) would race on `registerPendingSuggestionApplier(undefined, fieldName, …)` and the last `useEffect` would win.

**`@pilotiq/pilotiq` (minor — new public API, additive)**

- New `useFormId(): string | undefined` hook re-exported from `@pilotiq/pilotiq/react`. Reads the surrounding `FormRenderer`'s id from `FormIdContext` and normalizes the sentinel empty string to `undefined`. Adapter packages (Tiptap + future editor adapters) consume this to scope per-field registries by form.
- `getPendingSuggestionApplier(undefined, fieldName)` now falls back to ANY matching scoped entry when no wildcard entry is registered. Closes the regression that would have followed from adapter scoping: editors now register under their form's id, so the wildcard slot is almost always empty — without the fallback, global producers (suggestions pushed without a `formId`) would silently fail to resolve. Scoped lookups + explicit wildcard registrations preserve their original precedence.

**`@pilotiq/tiptap` (patch — internal hook wiring)**

`useAiInlineDiff` and `useAiSuggestionBridge` now thread `useFormId()` into `registerPendingSuggestionApplier(formId, fieldName, applier)` and the effect's dep array. No public-surface change; the multi-form routing simply works now.

Coverage: 9 new unit tests on `PendingSuggestionApplierRegistry` cover scoped lookup, scoped multi-form disambiguation, the global-producer fallback, precedence (wildcard wins over scoped for undefined lookups when both exist; scoped wins for explicit lookups), unregister cleanup, and re-register identity guard.
