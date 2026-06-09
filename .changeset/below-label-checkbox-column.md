---
"@pilotiq/pilotiq": minor
---

Two Filament-parity additions: `Field.aboveLabel(text)` / `Field.belowLabel(text)` render muted captions hugging the field label (above it / between it and the input — distinct from `helperText`, which stays under the input; both compose with `inlineLabel()`), and `CheckboxColumn` — an inline-edit boolean cell column sharing `ToggleColumn`'s immediate-PATCH semantics (optimistic with rollback, `.confirm(message)` gate, per-row `canEdit` gating) rendered as a checkbox instead of a switch.
