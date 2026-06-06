---
"@pilotiq/pilotiq": minor
---

`ListPage.getBulkActions(R, basePath)` — page-level hook for the selection-toolbar bulk actions, mirroring `getHeaderActions` / `getRowActions`. Returns `[]` by default (Filament-style explicit opt-in); results merge with the same dedup rule — actions you already added inside `Resource.table()` win over same-named hook results — and land through `table.bulkActions()` so `placement: 'bulk'` stamps automatically.
