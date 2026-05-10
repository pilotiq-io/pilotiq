---
'@pilotiq/pilotiq': minor
---

feat(core): `TableGroup.scopeQueryByKey()` — click-a-group-heading-to-drill-in

Click a banded group's heading to drill the table into just that group's
rows. The banded layout disappears for that render, a "Drilled into
<Label>: <Value>" chip mounts above the table with an × to clear, and
the query has already been narrowed server-side via the registered scoper.

```ts
Table.make()
  .groups([
    TableGroup.make('status')
      .label('Status')
      .scopeQueryByKey((q, key) => q.where('status', '=', key)),
  ])
  .defaultGroup('status')
```

**Three new methods on `TableGroup`:**

- `scopeQueryByKey(fn)` — query scoper applied when the user clicks a
  heading. Receives `(q, key)` and returns the narrowed query. **Default
  (no override):** exact-match `(q, key) => q.where(column, '=', key)`.
  Date groups (`.date()`) install a whole-day range default instead —
  `(q, key) => q.where(col, '>=', '${key} 00:00:00').where(col, '<=', '${key} 23:59:59')`.
  Auto-arms `.scopable(true)`.
- `getKeyFromRecordUsing(fn)` — override the per-record bucket key
  resolver. Returned string round-trips through `?<prefix>groupKey=` and
  lands as the second arg of `scopeQueryByKey`. Default = raw column
  value cast to string (or the `YYYY-MM-DD` bucket when `.date()` is on).
  Auto-arms `.scopable(true)`.
- `scopable(v = true)` — explicit opt-in toggle for the clickable
  heading affordance. Use `.scopable(false)` to opt back out after a
  setter has auto-armed it.

**URL state:** dedicated `?groupKey=<value>` key, prefix-aware via
`Table.queryStringIdentifier`. Pairs with `?group=<col>`. Clicking a
heading resets `?page` to 1 server-side so drill-in always lands on the
first page of the bucket. The × chip clears `?groupKey=` and restores
the banded view.

**Renderer:** group heading text wraps in a real `<a href>` when
`scopable` is true (cmd-click / right-click "open in new tab" works);
plain left-click SPA-navs via `useNavigate()`. The collapsible chevron
(when `.collapsible()` is also set) stays separate so users can fold
the group without drilling in.

**Persistence:** `<prefix>groupKey` is excluded from
`persistFiltersInSession`'s persisted slice (parallel to `<prefix>page`)
— drill-in is page-state, not filter-state. Bare-URL visits return to
the banded view; the user's last drill-in URL is shareable but not
auto-restored on revisit.

**Composition:**

- Chains on top of filters / `TrashedFilter` / active tab query — runs
  after all of them via `ctx.groupScope` in the model adapter.
- Suppresses per-group summaries (`groupSummaries`) for the drilled-in
  render; the global `tfoot` summary still computes over the visible
  bucket.
- Composes with `queryStringIdentifier` — keys parse as
  `<id>_groupKey` alongside `<id>_group`.
- Works on `RelationManager` tables — `modelRelationTableRecords`
  reads the same `ctx.groupScope`.

**v1 limits:** one key at a time (multi-select drill-in deferred);
drill-in URLs survive bookmarking but not session-persistence; date
range default is whole-day (sub-day buckets need a custom scoper).

Plan: `docs/plans/table-group-scope-query-by-key.md`.
