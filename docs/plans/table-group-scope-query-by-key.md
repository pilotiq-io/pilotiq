# Plan: `TableGroup.scopeQueryByKey()` — click-a-group-heading-to-drill-in

**Surfaced by:** open-core audit (admin-gap-audit) — `scopeQueryByKey` carried as a deferred item because the surface couples to filter-wiring decisions.

**Goal.** Let users click a banded group's heading to drill the table into just that group's rows — no more group banding, just the filtered list. Adopt the conventional admin-table shape: a `scopeQueryByKey(fn (q, key))` scoper paired with `getKeyFromRecordUsing(fn (record))`, defaulting to `where(column, '=', key)` when the user doesn't override.

---

## Scope (v1 — ship; v2 — defer)

**Ship:**
- `TableGroup.scopeQueryByKey(fn)` — query scoper for a single drilled-in key. Default = `(q, key) => q.where(column, '=', key)`.
- `TableGroup.getKeyFromRecordUsing(fn)` — per-record key resolver. Default = raw column value; for `date()` groups, the `YYYY-MM-DD` bucket key.
- `TableGroup.scopable(b = true)` — opt-in toggle for the clickable heading affordance. Auto-armed when `scopeQueryByKey()` or `getKeyFromRecordUsing()` is called (having either without click-to-drill is meaningless).
- URL state — dedicated `?groupKey=<value>` key (prefix-aware via `Table.queryStringIdentifier`). Pairs with `?group=<col>` so the server knows which group's scoper to apply.
- Renderer — wraps the group heading text in `<a href>` when `scopable` is true; SPA-nav via `useNavigate()`. Cmd-click falls through to a new tab cleanly.
- "Drilled into X" chip above the table when `?groupKey=` is active, with × to clear (restores group banding).
- `date()` interaction — when a `date()` group has no user-supplied `scopeQueryByKey`, install a default range-encoding scoper: `(q, key) => q.where(col, '>=', `${key} 00:00:00`).where(col, '<=', `${key} 23:59:59`)`. User override wins.
- Exclude `<prefix>groupKey` from `persistFiltersInSession` slice (drill-in is page-state, not filter-state — parallel to `?page`).

**Defer (no consumer ask yet):**
- `groupsOnly()` — summary-only mode (hide rows, show only group summaries). Useful for reporting but needs the per-group summary surface we already have, plus a renderer mode that suppresses the row body. Wait for a consumer ask.
- `titlePrefixedWithLabel(false)` — cosmetic toggle on the heading display. Add when a user complains about the "Label: Value" prefix.
- `groupRecordsTriggerAction(action => …)` — chrome customizer on the dropdown trigger. Out of scope; only matters once consumers want a non-default trigger button.
- Multi-key drill-in (`?groupKey=draft,published`) — needs `where IN`-encoding contract on the scoper. Defer until asked.
- Cross-table-join drilled queries — the `scopeQueryByKey` signature is `(q, key)`. Joins are the user's responsibility inside the handler; no framework support.

---

## Wire shape

```ts
// TableGroup meta, augmented:
interface TableGroupMeta {
  column:      string
  label:       string
  collapsible?: true
  collapsed?:   true
  date?:        true
  scopable?:    true   // NEW — renderer mounts a clickable heading
}

// Table meta, augmented:
interface TableMeta {
  // …existing fields…
  activeGroupKey?: string  // NEW — sparse; absent when not drilled-in
}
```

Both new fields are sparse (omitted when not opted in / not active) so existing meta payloads are byte-identical for non-scopable tables.

---

## Server flow

**`TableGroup` API** (`packages/pilotiq/src/elements/TableGroup.ts`):
- Add `_scopeQueryByKeyFn?: (q, key) => ModelQuery`. Default applied during `loadTableRecords` if undefined.
- Add `_keyFromRecordFn?: (record) => string`. Default = raw `record[column]` (or `bucketDateValue(raw)` when `isDate()`).
- Add `_scopable = false` flag. Setters auto-arm: `scopeQueryByKey(fn) → this._scopable = true; this._scopeQueryByKeyFn = fn`. Same for `getKeyFromRecordUsing`. Bare `.scopable(false)` explicit opt-out wins.
- `toMeta()` emits `scopable: true` when `_scopable === true`.

**URL parsing** (`dispatchTable.ts`):
- New `parseActiveGroupKey(query, prefix?): string | undefined` — reads `prefixedKey(prefix, 'groupKey')`. Empty string → `undefined` (explicit clear).
- `loadTableRecords` resolves both `?group=` and `?groupKey=`. When `groupKey` is set AND the active group is `scopable`:
  - **Suppress banding**: skip per-row `_groupValue / _groupTitle / _groupDescription` stamping.
  - **Apply scoper**: thread the group + key through `TableContext` as `groupScope: { group: TableGroup, key: string }` so the model adapter's existing `if (customQuery)` branch can pick it up. User-defined `Table.records(fn)` handlers can also branch on `ctx.groupScope`.
  - **Reset page**: leave `effectivePage = 1` regardless of the URL value (parallels how filter changes elsewhere handle page reset client-side).
  - **Emit chip**: stamp `table.withActiveGroupKey(key)` so `toMeta` emits `activeGroupKey`.
  - **Suppress per-group summaries**: `groupSummaries` no longer makes sense when drilled in; only the global `tfoot` summary runs.
- Stale-key handling: if `groupKey` is set but the named group is unregistered, OR isn't `scopable`, OR the column isn't found — silently treat as `groupKey=undefined` (matches the existing stale-bookmark treatment for `?group=col`).

**Model adapter** (`modelDefaults.ts`):
- Read `ctx.groupScope` after filter application, before pagination. Call `ctx.groupScope.group.getScopeQueryByKey()(q, ctx.groupScope.key)` to splice the predicate. Mirrors how the existing custom filter `_queryFn` slots in.

**Date bucket default**:
- In `TableGroup`, when `isDate()` is true AND the user hasn't called `scopeQueryByKey()`, install a default range scoper that maps `YYYY-MM-DD` → `[YYYY-MM-DD 00:00:00, YYYY-MM-DD 23:59:59]`. Resolved at scope-call time, not at config-time, so a later user override still wins.

**Composition**:
- With filters — chains. `?status=draft` + `?group=status&groupKey=draft` is redundant-but-harmless (predicate added twice).
- With pagination — `?page` resets to 1 on drill-in click (URL written without `page`).
- With search — preserved through the URL.
- With `?sort=` — preserved.
- With `queryStringIdentifier` — `<id>_groupKey` parsed alongside `<id>_group`.
- With `TrashedFilter` — chains (drill-in scope runs on the same query that's already had soft-delete scope applied).

---

## Client flow

**Renderer** (`SchemaRenderer.tsx`, near the existing group-heading render site at L6176):
- When `tableMeta.groups[active].scopable === true`, wrap the heading content in a `<a href>` instead of a plain `<button>` (the collapsible button stays as a sibling chevron — clicking the chevron folds the group, clicking the text drills in).
- Heading link href = current URL with `<prefix>group` preserved (so the active group selection survives) and `<prefix>groupKey` set to `row._groupValue` (the same key the scoper will receive). Drop `<prefix>page`.
- Plain left-click → SPA nav. Cmd/Ctrl-click → browser default (new tab). The link is a real `<a href>` for a11y and right-click "Open in new tab" semantics.
- New `<ActiveGroupKeyChip>` above the table when `meta.activeGroupKey` is set. Shows "Drilled into <label>: <displayKey>" with an × that nav's to a URL with `<prefix>groupKey=` cleared (empty string — explicit clear, distinct from absent). Display key prefers a resolved title (from a server-side `getTitleFromRecordUsing` lookup on any matching row), falling back to the raw key.

**Persistence**:
- `sessionFilters.ts` — add `<prefix>groupKey` to the excluded-keys set parallel to `<prefix>page`. The drill-in state is ephemeral page state, not filter state — bookmarking a drilled-in table can use the URL directly, but the per-resource persistence slot shouldn't capture it.

---

## Tests

**`TableGroup.test.ts`:**
- `.scopeQueryByKey(fn)` auto-arms `.scopable()`.
- `.getKeyFromRecordUsing(fn)` auto-arms `.scopable()`.
- `.scopable(false)` after `.scopeQueryByKey(fn)` opts back out.
- Default `getKey` returns raw record value; `date()` overrides with bucket.
- `date()` + no user scoper installs the range-encoding default.

**`dispatchTable.test.ts`:**
- Drill-in suppresses `_groupValue` stamping when `groupKey` is set.
- Drill-in suppresses `groupSummaries` while preserving global `tfoot` summary.
- Stale `groupKey` (unregistered column, non-scopable group, unknown group) silently drops.
- `groupKey` resets `?page` server-side (deferred-load endpoint receives `page=1`).
- `queryStringIdentifier` threads `<id>_groupKey` correctly alongside `<id>_group`.
- Chains with `TrashedFilter`, named filters, and active tab query.
- `date()` group's range-encoding default fires when a user hasn't overridden.

**`sessionFilters.test.ts`:**
- `<prefix>groupKey` excluded from persisted slice (parallel to `<prefix>page`).

**Renderer:**
- Smoke test in the playground — `PostResource` adds `.scopeQueryByKey()` to one group; clicking a heading drills in; the chip shows + clears.

---

## Files touched

**Modified:**
- `packages/pilotiq/src/elements/TableGroup.ts` — three new methods + meta field.
- `packages/pilotiq/src/elements/dispatchTable.ts` — parse `groupKey`, branch in `loadTableRecords`, thread `groupScope` through `TableContext`.
- `packages/pilotiq/src/elements/Table.ts` — `withActiveGroupKey(value)` mirror; `toMeta` emits `activeGroupKey?`.
- `packages/pilotiq/src/orm/modelDefaults.ts` — read `ctx.groupScope` in the default `modelTableRecords` and splice the scoper after filters.
- `packages/pilotiq/src/sessionFilters.ts` — extend excluded-keys check.
- `packages/pilotiq/src/react/SchemaRenderer.tsx` — heading link + `ActiveGroupKeyChip`.

**New tests:**
- `packages/pilotiq/src/elements/TableGroup.test.ts` — additions to existing file.
- `packages/pilotiq/src/elements/dispatchTable.test.ts` — additions.

**Docs:**
- `docs/guide/query-string-identifier.md` — add row to the reserved-keys table noting `<id>_groupKey`.
- `packages/pilotiq/CLAUDE.md` — update the `TableGroup` line under "Key Files" to mention scopable / scopeQueryByKey / getKeyFromRecordUsing.
- New: `docs/guide/grouping.md` — first dedicated grouping guide. Mention `defaultGroup`, `Table.groups([…])`, every `TableGroup` setter, the drill-in flow + chip, the date-bucket default, and the v1 limits.

**Changeset:** `table-group-scope-query-by-key.md` — minor (additive, opt-in).

---

## v1 limits (documented)

- One key at a time. Multi-select drill-in deferred — needs an `IN`-encoding default and a multi-select dropdown chip.
- Drill-in is page-state, not filter-state. Doesn't survive `persistFiltersInSession`.
- `date()` range default is whole-day. Sub-day buckets need a custom `scopeQueryByKey`.
- The chip's display key falls back to the raw bucket value when no matching row's title is found in the current page. (Drilled-in pages are filtered down, so the first row almost always matches and provides a title — but a drill-in to an empty bucket shows the raw key. Acceptable for v1.)
- The `getKeyFromRecordUsing` default is the raw column value cast to string. Object-typed columns (JSON blobs grouped by their stringified form) need a custom resolver.

---

## Open questions

- **Should `?group=` survive the drill-in URL, or should clicking a heading clear it too?** Plan keeps the active group selection so the chip can say "Drilled into <label>" and the user can clear the drill-in via × to return to banded view. If a consumer wants drill-in to also exit group mode, they can clear both in their own handler — but the default is to preserve.
- **Should the heading still be collapsible when scopable?** Plan keeps both affordances side-by-side (chevron folds, text drills in). If that's noisy, future work can hide the chevron when scopable is on; for v1 it's an additive feature so we preserve.
- **Should the chip support a "back to drill-in" round-trip?** v1 just clears via ×. Browser back is the natural undo. Skip until asked.

---

## Out of scope

- `groupsOnly()` — summary-only mode. Track separately if asked.
- `titlePrefixedWithLabel(false)` — cosmetic. Add inline when first asked.
- Renderer customization for the drill-in chip (badge color, position). v1 ships one shape.
- A panel-level "exit drill-in" keyboard shortcut.
