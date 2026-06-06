---
"@pilotiq/pilotiq": minor
---

`ModelQuery` gains `with(...relations)` and `withCount(arg)` as required members, so eager loading typechecks when chaining on pilotiq-typed builders — `Resource.query()` overrides, `TableWidget.query(q => q.with('author'))`, `ListTab.modifyQuery`, `Filter.query`, etc. Rudder Models stay structurally assignable (the ORM `QueryBuilder` always ships both). The `whereGroup` / `orWhereGroup` callback sub-builder is now typed as the narrower `ModelQueryGroup` (where-family subset, newly exported) — matching what rudder's contracts-level builder actually provides inside a group. Type-level breaking for hand-rolled `ModelLike` implementations and test stubs: add `with() { return this }` / `withCount() { return this }`.
