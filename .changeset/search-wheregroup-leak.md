---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): wrap multi-column search in a `whereGroup` so it can't leak past surrounding scopes

List search, relation-manager search, and global (Cmd+K) search built their LIKE chain as a bare `where(col0).orWhere(col1)…` and appended scopes/filters as separate `.where()` clauses. With an adapter that honours Laravel-parity `where`/`orWhere` precedence — `@rudderjs/orm-prisma` ≥2.0 — that compiles to `(scope AND col0 LIKE x) OR col1 LIKE x`, so a row matching the second-or-later searchable column would bypass the surrounding scope: trashed records (soft-delete `deletedAt IS NULL`), filtered-out rows, or — in a relation manager — another parent's rows would leak into search hits.

The three search sites now route through a shared `applyColumnSearch(q, columns, needle)` helper that wraps the OR-chain in `q.whereGroup(…)` → `scope AND (col0 LIKE x OR col1 LIKE x OR …)`. This is correct and adapter-version-independent. `whereGroup` is optional on `ModelQuery`; when a builder doesn't implement it (bare drivers / test stubs) the helper falls back to the flat chain unchanged.
