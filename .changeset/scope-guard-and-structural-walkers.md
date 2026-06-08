---
"@pilotiq/pilotiq": patch
---

Two robustness fixes from an internal audit:

- **Delete scope-bypass guard:** the resource delete route loads the record through `Resource.query()` (which may be tenant/owner-scoped) but `deleteRecord` runs against the raw model — so a resource that scopes rows via `Resource.query()` while leaving `canDelete` at its default could let a user delete an out-of-scope record by POSTing its id. The route now returns 404 when the scoped load misses (model-backed resources only), matching the relation routes and treating `Resource.query()` as an authorization boundary (Filament `getEloquentQuery()` parity). In-scope deletes are unaffected.
- **Structural walker checks (Vite SSR hardening):** replaced `instanceof Field/RepeaterField/BuilderField/Column/Filter/Action` with the codebase's structural `getType()` / `isRepeaterField` / `isBuilderField` convention across the form-coerce, dehydrate, and state-update walkers (`dispatchForm.ts`), the editable-cell column lookup and delete/editable boot guards (`routes.ts`, `routes/resources.ts`), and the soft-delete `TrashedFilter` auto-injection (`defaultPages.ts`, `relationPages.ts`). These sites compare framework classes against user-constructed schema objects, where Vite SSR module duplication can make `instanceof` silently miss — which would drop form-field coercion (500 on save), break inline-cell edits, or replace a resource's entire filter set with just the injected TrashedFilter. `TrashedFilter` gained an `isTrashedFilter()` structural marker for the dedup.
