---
name: Relations — many-to-many
description: Plan #11 follow-up. Extend `RelationManager` to support belongsToMany now that `@rudderjs/orm` ships pivot support. Adds attach/detach/sync actions, an Attach modal with a candidate picker, three new POST routes, and two new can* predicates. Pivot extras + reorderable pivots stay deferred until the ORM grows pivot read + ordering APIs.
type: plan
---

# Relations — many-to-many

Plan #11 (relations) shipped the RelationManager primitive scoped to
`hasOne / hasMany / belongsTo` because `@rudderjs/orm` didn't have
pivots. The ORM landed `belongsToMany` on 2026-05-03; this plan widens
RelationManager to support it.

The shipped `belongsToMany` accessor (verified against ORM source
`packages/orm/src/index.ts:1520-1545` + tests `index.test.ts:1917-2232`):

- `attach(input: id[] | { id → flatPivot }, flatPivot?)` — inserts pivot rows
- `detach(ids?)` — deletes pivot rows; `detach()` deletes all, `detach([])` no-ops
- `sync(desiredIds, flatPivot?) → { attached: id[], detached: id[] }` — diff-and-patch
- `parent.related(name)` — chainable query (reads only — `create/update/delete` throw)

What the ORM v1 does **not** ship: pivot column read-through (pivot
extras are write-only via `attach`'s flatPivot), `withPivot([…])`,
`withTimestamps()`, ordering on the pivot (`orderByPivot`), polymorphic
M2M (`morphedByMany`). Pilotiq's M2M v1 stays inside that envelope.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. ORM inventory | ✅ DONE 2026-05-03 | belongsToMany shipped: attach/detach/sync + chainable read query. No pivot reads, no ordering, no timestamps. Polymorphic still deferred. |
| 2. RelationManager M2M auto-detection | ✅ DONE 2026-05-03 | `RelationMode` type alias + required `mode` on `RelationManagerContext` derived in `pageData.relationManagerData` via `getRelationType(R.model, scope.relationship)`. Routes side computes once per (R, M) closure at registration. Anything other than `'belongsToMany'` collapses to `'hasMany'` (the binary distinction the manager UI surface cares about). |
| 3. Reserved relationship tokens | ✅ DONE 2026-05-03 | `_attach`, `_detach`, `_bulk-detach` added to `RESERVED_RELATIONSHIP_TOKENS`. |
| 4. Two new can* predicates | ✅ DONE 2026-05-03 | `canAttach(user, parentRecord)` and `canDetach(user, record, parentRecord)` on `RelationManager`. `safeManagerPolicy` widened with a `managerOnly` short-circuit so neither falls through to the related Resource (pivot ops aren't record ops). |
| 5. POST routes | ✅ DONE 2026-05-03 | Two new routes per relation manager (registered unconditionally — handler-style actions are useful on hasMany too): `POST {parentBase}/_action/:actionName` (manager-scoped action dispatch — stamps `ctx.relation = { parent, parentId, relationship }` onto the dispatcher) and `POST {parentBase}/:childId/_detach` (M2M-only — guarded with a 404 when `mode !== 'belongsToMany'`). The third URL from the original plan (`_bulk-detach`) collapses into the `_action/:actionName` dispatcher because bulk-detach is a handler-style action — no separate route needed. IDOR check on `_detach` runs `where(pk, '=', childId).paginate(1, 1)` against the parent's relation accessor before calling `.detach([id])`. |
| 6. Action factories | ✅ DONE 2026-05-03 | `Action.relationAttach(M, ctx)` (header, modal-form with `SelectField` candidate picker → handler that calls `parent.related(rel).attach([id])`); `Action.relationDetach(M, ctx)` (row, direct POST to `_detach/:childId`); `Action.relationBulkDetach(M, ctx)` (bulk, handler that calls `parent.related(rel).detach(ids)`). All three auto-hide when `ctx.mode !== 'belongsToMany'`. Visibility predicates use `safeManagerPolicy` with the new `canAttach / canDetach` methods. New `ActionContext.relation` field carries the request-time parent record; `DispatchActionInput.relation` threads it through. |
| 7. Candidate picker query | ✅ DONE 2026-05-03 | `attachFactory.ts` exports `loadAttachedIds(parent, rel, relatedModel)` and `loadAttachableCandidates(parent, rel, relatedModel, recordTitleAttr, limit?)`. Used by `buildAttachModalSchema` to populate the SelectField options at schema-resolve time. Limit fixed at 50 for v1; attached-ids cap at 1000. Uses the rudder ORM `parent.related()` convention — doesn't go through `ModelLike.relatedQuery` because the override only matters for the table render path, not for "what's already attached?" filtering. |
| 8. RelationManager M2M defaults | ❌ SKIPPED BY DESIGN | Auto-injecting defaults conflicts with pilotiq's Filament-style explicit actions stance (`feedback_filament_explicit_actions.md`). Users opt into M2M actions the same way they opt into create/edit/delete: by adding factories to `headerActions / recordActions / bulkActions` inside `static table()`. The factories themselves auto-hide when dropped into the wrong mode, so a user who copies an M2M wiring into a hasMany manager (or vice versa) gets a silent no-op rather than a broken UI — same shape as the rest of the action system. |
| 9. Auto-disable create/edit/delete factories under M2M | ✅ DONE 2026-05-03 | `relationCreate / relationEdit / relationDelete` visibility predicates short-circuit to `false` when `ctx.mode === 'belongsToMany'`. Drop-in safety: a manager wired with both hasMany defaults AND M2M defaults flips visibility cleanly when the underlying ORM relation type changes. `relationRestore / relationForceDelete` left untouched — they only fire on trashed rows, which is rare territory under M2M (the rudder ORM's pivot accessor does support `withTrashed()`, so a user explicitly wiring them on an M2M manager isn't broken — they just need to confirm the soft-delete intersect they want). |
| 10. Vike page stubs | ✅ DONE 2026-05-03 | No-op. List URL unchanged (`{slug}/:id/{rel}`); attach / detach / bulk-detach are pure POST endpoints driven by handler-style or form-method actions. The existing `relation-create` and `relation-edit` Vike stubs stay registered; under M2M the auto-hidden `relationCreate / relationEdit` factories never generate links to them, so they're unreachable in practice. |
| 11. Tests | ⏳ NOT STARTED | Target: ~30 new tests. RelationManager mode detection (4); reserved-token boot guard (2); canAttach/canDetach defaults + override + safeManagerPolicy short-circuit (5); manager-scoped `_action` route happy path + auth + records hydration + ctx.relation stamping (5); `_detach` route happy path + IDOR + 404-on-hasMany + auth fail (5); candidate picker filters attached ids (3); Action.relationAttach/Detach/BulkDetach factory visibility under both modes (6). |
| 12. Playground demo | ⏳ NOT STARTED | `playground-pilotiq`: `Article ↔ Tag` (belongsToMany). New `Tag` Prisma model + `_ArticleToTag` implicit pivot in shared schema. New `app/Models/Tag.ts` + `static relations.tags` on Article model. New `app/Pilotiq/Articles/relations/TagsManager.ts` (verifies the wiring) + `app/Pilotiq/Tags/TagResource.ts` so the candidate picker can resolve titles. Verified: list shows attached tags, attach modal lists unattached tags only, detach removes pivot row but keeps Tag, bulk-detach + reattach round-trips. |
| 13. Docs | ⏳ NOT STARTED | `docs/guide/relations.md` "Many-to-many" section. Update "Out of scope" to remove M2M, keep polymorphic + pivot extras + pivot ordering. `docs/plans/admin-gap-audit.md` blocker row already flipped. README features bullet. CLAUDE.md addition. Memory: `feedback_relations_belongstomany_deferred.md` already updated; add `project_pilotiq_relations_m2m.md`. |

**Tests at start:** 1723/1723 (post import-export). **Target at completion:** ~1755 (+30).

**Estimated effort:** ~3 days. Smaller than the original Plan #11 (~2 weeks) because the foundation is in place — only the M2M-specific ergonomics are new.

## Out of scope (deferred)

- **Pivot extras editing** — ORM v1 doesn't surface pivot columns on read, so any UI for editing them would be write-only. Wait for ORM `withPivot([…])`.
- **Reorderable pivot rows** — needs ORM `orderByPivot('position')` + `withPivot(['position'])`. Same gating.
- **`syncWithoutDetaching` / `toggle`** — ORM ships `attach / detach / sync`. The RelationManager UI doesn't need the others; users with custom needs hit the accessor directly via a custom `Action.handler`.
- **Polymorphic M2M (`morphedByMany`)** — ORM still defers polymorphic relations.
- **Builder.relationship() heterogeneous variant** — separate plan; needs polymorphic `type` column scheme (and probably polymorphic ORM relations).
- **Resource-side `canAttach / canDetach`** — these are pivot-level operations and don't have a Resource analogue (the Tag isn't being created or deleted). Manager-only predicates by design.

## Open design choices (will resolve during impl)

1. **Mode detection failure mode** — when `parentModel.relations[rel].type` is missing or unrecognized, fall back to `hasMany` (status quo) with a warn? Or throw at boot? Lean toward **throw at boot**: silent fallback would mean a M2M manager rendering as hasMany (broken create/edit) and users wouldn't know why.
2. **Search inside the Attach modal** — debounced server roundtrip vs prefetch + client-filter. Lean toward **prefetch up to 50, client-filter** for v1 (relations rarely have >50 candidates worth attaching at once); document the cap, add a `Resource.relationSearchUsing(query)` escape hatch for high-cardinality relations.
3. **Confirm dialog on `Action.relationDetach`** — Filament confirms detach by default. We don't currently confirm `relationDelete`. Lean toward **no default confirm** (consistency with existing factories); users add `.requiresConfirmation()` opt-in.
4. **Render hint for the empty-state** — when a relation table is empty AND `canAttach`, default `emptyStateActions` to `[relationAttach]`. Mirrors what the resource list does with `Action.create`.

## Files to touch

- `packages/pilotiq/src/RelationManager.ts` — new context field `mode`, two new can* predicates, `safeManagerPolicy` widened, reserved tokens.
- `packages/pilotiq/src/relationManagerData.ts` (new — split from `pageData.ts`'s relation builders if it grows past ~400 lines) — mode detection + `loadAttachCandidates` helper + default action injection.
- `packages/pilotiq/src/routes.ts` — three new POST handlers under the relation block.
- `packages/pilotiq/src/actions/Action.ts` — three new factories (`relationAttach / relationDetach / relationBulkDetach`); guard rails on `relationCreate / Edit / Delete` under M2M mode.
- `packages/pilotiq/src/orm/modelDefaults.ts` — new helpers `getRelationType(parentModel, name)` and `loadAttachableIds(parent, name, limit)`. (Current `getParentRelationDescriptor` already reads the relations map; this widens it.)
- `packages/pilotiq/src/RelationManager.test.ts` + `routes-relations.test.ts` + `relationManagerData.test.ts` — new cases per step 11.
- `playground-pilotiq/prisma/schema/*` — Tag model + implicit M2M (`_ArticleToTag`).
- `playground-pilotiq/app/Models/{Article,Tag}.ts` — relations entries.
- `playground-pilotiq/app/Pilotiq/Articles/relations/TagsManager.ts` (new) + `playground-pilotiq/app/Pilotiq/Tags/TagResource.ts` (new).
- `docs/guide/relations.md`, `docs/plans/admin-gap-audit.md`, `README.md`, `packages/pilotiq/CLAUDE.md`.

## Risks

- **Pivot extras silently lost** — if a user's `attach(ids, { addedBy: 'x' })` worked once and they forget pilotiq doesn't expose pivot reads, the data round-trips invisibly. Mitigation: when ORM later ships pivot reads, audit the `relationListData` builder to surface pivot columns; document the v1 limitation prominently.
- **Implicit Prisma pivots** — Prisma's implicit M2M (`_ArticleToTag`) doesn't expose the pivot table for direct queries (the rudder ORM hides this). Verify `attach / detach / sync` work end-to-end against an implicit pivot in the playground before claiming M2M support; explicit pivot is the same code path on the ORM side.
- **Candidate picker N+1** — naive impl loads attached ids then queries `whereNotIn(...)` against the related model. For relations with thousands of attached rows, this gets large. Cap fetch at 50 candidates + 1000 attached-ids before falling back to `relationSearchUsing` escape hatch (which the user implements as a real DB query). Document.
