---
"@pilotiq/pilotiq": minor
---

Option values accept `string | number` — integer-PK apps no longer wrap every id in `String(...)`. Widened: `SelectOption.value` (SelectField / Radio / CheckboxList / ToggleButtons, static arrays and `options(fn)` resolvers), `SelectColumn.options(...)` array form, `SelectFilter` / `MultiSelectFilter` / query-builder `SelectConstraint` options, and `createOptionUsing`'s returned `value`. Numeric values normalize to strings at the wire boundary (HTML form bodies are string-only), so the rendered options — and the value that comes back on submit — are always strings; coerce back with `dehydrateStateUsing` or ORM casts when the column is numeric. New `ResolvedSelectOption` type describes the normalized wire shape.
