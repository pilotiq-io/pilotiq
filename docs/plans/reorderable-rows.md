# Reorderable rows

Last open Tier-2 line in `admin-gap-audit.md` — drag rows in a list table
to set their persisted order. Filament-style: opt in with
`Table.reorderable('sort')`, the column names the model attribute the new
order is written back to.

## Why

Manually-ordered lists ("featured posts" / "homepage cards" / "menu
links") are common enough that admin frameworks ship reorderable as a
table primitive rather than a per-app workaround. The current toolkit
forces users to write a custom `Table.records(fn)` + a custom action +
client-side glue; this collapses it to one builder call plus an ORM
contract method.

## API

```ts
PostResource.table = (t) =>
  t.reorderable('sort')                       // column name on the model
   .columns([…])
```

Default column name is `'sort'` (Filament parity).

The same column doubles as the default sort: when `reorderable(col)` is
set and `defaultSort` is unset, the table renders sorted `(col, asc)`.
URL-driven sort still wins.

## ORM contract

Add an optional method to `ModelLike`:

```ts
interface ModelLike {
  …
  reorder?(ids: Array<string | number>): Promise<void>
}
```

The implementation overwrites the sort column for each id in the array,
in array order (1..n). Pilotiq doesn't ship the impl — rudder's ORM (or
user code) does. Boot-time guard: panic when `Resource.table()` declares
`reorderable()` but `R.model?.reorder` is missing, the same way Plan #13
does for `restore` / `forceDelete`.

## Route

```
POST {base}/{slug}/_reorder
Body: { ids: (string | number)[] }
→ { ok: true }
```

Auth: `R.canAccess(user)` + `R.canEdit(user)` (record-less, list-level).
Returns 422 on adapter throws (with `error` string), 403 on policy fail,
404 when the slug isn't a registered resource. JSON-only — there's no
non-fetch path for drag-and-drop.

The route URL is stamped onto the table's meta as `reorderUrl` by a new
`tagTableReorderUrls(elements, urlBuilder)` helper called from
`resourceIndexData` — mirrors how `tagFormStateUrls` stamps `stateUrl`
onto live forms.

## When drag is locked off

The new order only round-trips if the visible rows are the canonical
sort. Drag is **disabled client-side** when:

- current sort isn't the reorder column, or direction is `desc`
- `?search=…` is set
- any filter has a value
- a list-page tab other than the default is active
- pagination is past page 1 *and* the page isn't full (mid-page boundary
  — handled by simply not letting users cross page boundaries; v1 just
  no-ops drag entirely while filters/search/tabs are active).

Visual treatment: the grip-handle column hides (or shows greyed-out and
non-draggable) and a small one-line hint replaces the active-filters bar
("Drag to reorder is paused — clear filters to re-enable").

## Renderer

- New leftmost column (rendered before the row-select cell) carrying a
  ⋮⋮ grip handle. Only emitted when `meta.reorderable` is true.
- Native HTML5 DnD on `<tr>` — same pattern as `RepeaterInput`'s row
  reorder (drop indicator: 2px line above the hovered row).
- On drop: optimistic local reorder of `meta.rows` in React state +
  `fetch(reorderUrl, { method: 'POST', body: JSON.stringify({ ids }) })`.
  On non-OK: roll back + error toast. On OK: stay on the new order; the
  next page load uses the persisted column.

## Tests (~15-20 new)

| File | What |
|------|------|
| `Table.test.ts` | `reorderable()` builder + getter; meta emits `reorderable: true` + `reorderableColumn`; default-sort fallback when reorderable + no defaultSort. |
| `orm/modelDefaults.test.ts` | Type-level: `ModelLike.reorder` is optional. |
| `dispatchTable.test.ts` | When meta.reorderable but URL sort overrides, `defaultSort` is the user's, not the reorder column. |
| `routes.test.ts` | POST `_reorder` happy path, 403 on canEdit-false, 422 when adapter throws, 404 on unknown slug, boot error when reorderable() but no model.reorder. |
| `pageData.test.ts` | `tagTableReorderUrls` stamps URL on tables with `reorderable`, skips otherwise. |

## Out of scope (v1)

- **Reorderable in RelationManager tables.** Same plumbing, scoped under
  `parent.related(rel)`. Wire later when a consumer asks.
- **Cross-page reorder.** Filament solves this by paging-off when
  reorderable; v1 keeps pagination on and just no-ops drag past page 1.
- **Optimistic-with-rollback animation polish.** Row stays in dropped
  position immediately; no flash on success.
- **Bulk drag (drag the selection).** v1 reorders a single row at a time.
- **Custom drop predicates / hierarchy / nesting.** Flat lists only.

## Implementation map

| Step | File(s) | Notes |
|------|---------|-------|
| 1 | `elements/Table.ts` | `reorderable(col)` + `withReorderUrl(url)` + meta + getters. |
| 2 | `orm/modelDefaults.ts` | Optional `reorder?(ids)` on `ModelLike`. |
| 3 | `elements/dispatchTable.ts` | Honor `_reorderableColumn` as defaultSort fallback. |
| 4 | `pageData.ts` | `tagTableReorderUrls` helper + call site in `resourceIndexData`. |
| 5 | `routes.ts` | Boot guard + `POST {base}/{slug}/_reorder` handler. |
| 6 | `react/SchemaRenderer.tsx` | Drag-handle column + DnD wiring + POST. |
| 7 | `index.ts` | (no new exports — Table builders already exported) |
| 8 | `playground-pilotiq` | Add `sort` column to Post + `Post.reorder` impl + `PostResource.table().reorderable()`. |
| 9 | `docs/plans/admin-gap-audit.md` + `docs/packages/pilotiq/resources.md` + README. |
