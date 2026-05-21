---
'@pilotiq/pilotiq': patch
---

perf(orm): use `.first()` over `paginate(1, 1)` for single-row lookups

Three internal callsites — `loadSingularRecord`, `findRecord`, and the relation `childBelongsToParent` IDOR check — were hand-rolling "first matching row" as `paginate(1, 1)` then reading `result.data[0]`. The rudder ORM (and most Laravel-style query builders) ship `.first()` for this case; `paginate(1, 1)` builds + executes a COUNT query plus the data query, where `.first()` is a single `LIMIT 1` SELECT.

Added an optional `first?(): Promise<unknown | null>` to the structural `ModelQuery` shape (same pattern as `withTrashed?` / `whereGroup?` / `whereNull?`). Callsites use it when present, fall back to the existing `paginate(1, 1)` shape when absent — so test stubs and user-supplied `ModelLike` implementations don't have to update. The rudder `QueryBuilder` ships it; production paths get a ~half-RTT win on every record edit / view / Global page render / relation-edit IDOR check, with zero behaviour change.

No public API change. Existing tests cover both branches.
