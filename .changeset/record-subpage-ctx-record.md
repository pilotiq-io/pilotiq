---
'@pilotiq/pilotiq': patch
---

Record sub-pages: `resourceRecordPageData` now threads the loaded parent record onto `SchemaContext.record`, matching the documented contract — `schema(ctx)` previously received `ctx.record === undefined` even though the record was loaded for gating and breadcrumbs.
