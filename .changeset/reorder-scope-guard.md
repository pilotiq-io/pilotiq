---
"@pilotiq/pilotiq": patch
---

Reorder scope guard: `POST /:slug/_reorder` now resolves every posted id through `Resource.query()` before calling `model.reorder(ids)` — any id outside the scoped query (tenant/owner filters, status guards) 404s the whole batch instead of writing order-column values onto records the user can't list. Mirrors the delete route's scope-bypass guard; soft-delete resources check via `withTrashed()` so reordering a trashed-filtered list still works.
