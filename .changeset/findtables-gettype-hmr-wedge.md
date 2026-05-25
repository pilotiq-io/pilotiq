---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): resource tables no longer wedge empty after a dev HMR re-boot (`findTables` structural check)

Editing a panel/schema file in dev (e.g. `app/Pilotiq/AdminPanel.ts`) triggers a framework re-boot that re-imports the schema modules. `findTables()` — the walker `loadTableRecords` uses to decide whether to run a resource's `records()` query — matched with `instanceof Table`. After a re-boot the page's `Table` element is an instance of a *different* `Table` class identity than the one `dispatchTable` closed over, so `instanceof` returned false, `findTables` returned `[]`, and `loadTableRecords` early-returned **without issuing `paginate`** — the resource list rendered its empty-state and stayed wedged (no rows, no error, no self-recovery) until a full dev-server restart. The nav-badge `count` runs on a separate path, so the symptom was "issues `count`, never `paginate`"; when `paginate` did run it always returned full rows, confirming the ORM/adapter was fine.

`findTables` now matches structurally on `getType() === 'table'` (mirroring `findForms` / `findActions`, which were converted for this exact Vite SSR module-duplication reason). Verified against the pilotiq playground: the pinned repro (single edit to `AdminPanel.ts` → poll the list) and a double-write + concurrent-flood both now render full rows on every request, warm and post-re-boot, including across re-imported model class identities. This closes the REOPEN #2 residual that the framework-side fixes (`@rudderjs/core` quiesce barrier, `@rudderjs/orm` model re-register) could not — the gate was pilotiq-side schema-walk behavior, not the framework re-boot lifecycle.
