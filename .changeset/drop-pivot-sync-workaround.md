---
"@pilotiq/pilotiq": patch
---

Drop the pivot-sync manual-diff workaround in `syncRelationshipSelect` — relationship-backed multi-selects (`SelectField.multiple().relationship()`) now delegate straight to the ORM's `accessor.sync(ids)`. `@rudderjs/orm` ≥ 1.17.1 compares pivot ids loosely (`String()` form) and writes DB-typed values across `belongsToMany` / `morphToMany` / `morphedByMany`, so the load-rows + `String()`-diff + type-corrected attach/detach path pilotiq carried since 0.31.1 is no longer needed. Apps on the native engine should bump `@rudderjs/orm` to ≥ 1.17.1 alongside this release — older orm versions re-attach unchanged string ids over numeric PKs and trip the pivot's UNIQUE constraint.
