---
"@pilotiq/pilotiq": minor
---

`Field.dehydrateStateUsing(fn)` — submit-time counterpart to `formatStateUsing`. The handler receives the already-coerced value plus `{ record, values }` and returns the value that lands in the persisted payload (classic: `ToggleField.make('active').dehydrateStateUsing(v => v ? 1 : 0)` for an integer column the ORM doesn't cast). Runs after type coercion and before the form-level `mutateData` hook; applies inside Repeater/Builder rows (row-scoped `ctx.values`); `simple()` Repeaters map the inner field's handler over the flat items; a handler on the Repeater/Builder field itself runs last over the whole array. Skipped for `dehydrated(false)` fields, keys absent from the submitted body, and relationship-backed fields (their values persist through the relation diff, not the parent payload). May be async.
