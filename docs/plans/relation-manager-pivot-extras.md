# Plan — RelationManager pivot extras (display + attach-with-extras + edit-pivot)

**Status:** proposed 2026-06-09
**Package:** `@pilotiq/pilotiq`
**Size:** M (1 commit, 1 changeset)

## Problem

M2M relation managers (`belongsToMany` / `morphToMany` / `morphedByMany`) can't see or edit
pivot extras. The v1 limitation note ("ORM doesn't surface pivot reads") is **stale** —
`@rudderjs/orm@1.20.0` (already pilotiq's floor in practice) ships the full surface:

- `withPivot(...cols)` — projects pivot columns onto related rows under a `row.pivot` envelope
  (`orm/dist/relations/pivot-deferred.js`).
- `attach(input, flatPivot?)` + `attach({ id: extras })` map form — write extras at attach time.
- `updatePivot(relatedId, data)` — rewrite extras on an existing pivot row.
- `wherePivot*` filter family (not needed for v1, available later).

`Repeater.relationship().pivotColumns()` already consumes all of this (fill flattens
`row.pivot[col]` in `pageData/helpers.ts:556–571`; persist splits child vs pivot columns and
calls `updatePivot` in `dispatchForm.ts:1858–2005`). The relation-manager surface is the
remaining half: a `Post ↔ Tags` manager with a `weight` pivot column has no way to show it in
the table, set it on attach, or edit it later.

Still genuinely blocked: **reorderable pivots** (no `orderByPivot` upstream) — stays deferred.

## Design

### 1. `RelationManager.pivotColumns` — read side

New optional static on `RelationManager`:

```ts
static override pivotColumns = ['weight', 'addedBy']
```

`modelRelationTableRecords` (`orm/modelDefaults.ts:726+`) chains
`q.withPivot(...M.pivotColumns)` when the resolved mode is M2M and the accessor supports it
(structural probe, mirroring `dispatchForm.ts:2004`'s `typeof q.withPivot === 'function'`).
Before returning rows, flatten `row.pivot[col]` onto the row for each declared column —
exactly the repeater-fill flatten — so `Column.make('weight')` in `static table()` just works
(sortable/searchable on pivot columns are NOT wired in v1; the flatten happens after the SQL).
Name collisions: a pivot column shadowing a real child column is the user's declaration choice
— pivot wins on the flattened row (same posture as the repeater fill); document it.

Non-M2M managers declaring `pivotColumns` get a clear boot error (mirrors the
`Repeater.relationship` config-time guards).

### 2. Attach with extras — `pivotForm`

New optional static:

```ts
static override pivotForm(form: Form): Form {
  return form.schema([NumberField.make('weight').default(0)])
}
```

`Action.relationAttach(M, ctx)` (`actions/m2mFactories.ts` + `attachFactory.ts`) appends the
resolved `pivotForm` fields below the existing record-select in the modal schema. The handler
splits the submitted values: the select's id goes to the existing attach POST, everything whose
name matches a `pivotForm` field rides as extras → `accessor.attach([id], extras)`. The
manager-scoped `_action` route already threads `relation: { parent, parentId, relationship }`
onto `DispatchActionInput`, so the accessor resolve (`resolveM2MAccessor`) needs no new
plumbing.

### 3. Edit pivot — `Action.relationEditPivot(M, ctx)`

New row-placement factory, auto-hidden unless the mode is M2M **and** the manager declares
`pivotForm`. Opens a modal built from `pivotForm`, prefilled from the row's flattened pivot
values (available per §1 — stamp the raw pivot envelope under a reserved `_pivot` row key so
the prefill doesn't depend on column declaration). Submit dispatches through the existing
manager `_action` route; handler calls `accessor.updatePivot(childId, extras)`.

**Authorization:** pivot writes are pivot-scoped operations, same family as attach/detach.
Gate attach-extras behind the existing `canAttach`; gate `relationEditPivot` behind a new
`canEditPivot(user, parent, child)` defaulting to `this.canAttach(user, parent)` (fail-closed
inheritance, mirrors `canForceDelete → canDelete`). It does NOT fall through to the related
Resource (pivot ops never do — established posture).

### 4. Out of scope (v1)

- Sort / search / filter on pivot columns (needs `orderByPivot` upstream for sort; `wherePivot`
  exists but the filter wiring deserves its own pass).
- Reorderable pivots (`orderByPivot` missing upstream).
- Pivot timestamps chrome (`createdAt` on the pivot renders like any declared column — no
  special casing).

## Files

- `src/RelationManager.ts` — `pivotColumns` / `pivotForm` / `canEditPivot` statics + boot
  validation (non-M2M guard).
- `src/orm/modelDefaults.ts` — `modelRelationTableRecords` withPivot chain + flatten + `_pivot`
  stamp.
- `src/actions/attachFactory.ts` — `buildAttachModalSchema` grows the pivotForm fields;
  extras split helper.
- `src/actions/m2mFactories.ts` — attach handler passes extras; new `relationEditPivotAction`.
- `src/actions/Action.ts` — `Action.relationEditPivot` thin delegator.
- `src/routes/relations.ts` — nothing new expected (reuses `_action` dispatch); verify the
  IDOR child-membership check covers the editPivot path.
- Docs: `docs/guide/relations.md` M2M section; `docs/packages/pilotiq/` mirror.

## Verification

- Unit: modelDefaults flatten + withPivot probe (stub accessor); attach-extras split;
  editPivot factory visibility (M2M-only, pivotForm-gated, canEditPivot fail-closed).
- e2e (playground): give `post_tags`-style pivot an extra column via a playground migration —
  or arm the existing `relatedPosts` self-M2M — attach with a value, see it in the manager
  table, edit it, confirm `updatePivot` round-trip. Pattern: temp-arm + revert, as with the
  cross-page-summaries verification.
