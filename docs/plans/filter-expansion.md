# Filter expansion — TernaryFilter + DateRangeFilter

Two new filter types layered on top of the existing `Filter` base. Tier-1
follow-up to `actions-tier-1.md` / `column-types.md` — small, independently
shippable, no new infra.

**Status: SHIPPED 2026-05-03.** Lives in `filters/TernaryFilter.ts` +
`filters/DateRangeFilter.ts`. One implementation note vs. the original
plan: both filter classes set their own `_queryFn` inside `make()`
(matching `TrashedFilter`'s pattern), so the model-adapter loop didn't
need new `'ternary'` / `'dateRange'` branches — the existing
`if (customQuery)` path covers them. The only model-adapter change was
adding optional `whereNull?(column)` to the `ModelQuery` interface
(parallel to Plan #13's `withTrashed?` / `onlyTrashed?`). Demo lives on
`PostResource` (publish-state TernaryFilter + Created DateRangeFilter).

## Why we want it

The current filter set is `SelectFilter` and `BooleanFilter`. Two common
needs aren't covered:

1. **Tri-state nullable booleans.** `BooleanFilter` is a yes/no/any tri-state
   on a non-null column — selecting "Any" means "no clause." For columns
   where `NULL` is a meaningful third state ("verified" / "unverified" /
   "not yet decided"), users want a filter that distinguishes the three.
   This is `TernaryFilter`.

2. **Date ranges.** Every list with a `createdAt` / `publishedAt` /
   `expiresAt` column wants "from X to Y" out of the box. Today users
   write a custom `Filter.query(fn)` against a `SelectFilter` with hand-
   rolled options ("Last 7 days", etc.) — fine but not range-shaped.

Both extend the `Filter` base naturally. The `FilterKind` discriminator
already anticipates them (the source comment lists `'multiSelect'`,
`'dateRange'`, `'numberRange'` as future kinds).

## TernaryFilter

### API

```ts
TernaryFilter.make('verified')               // ?verified=yes|no|blank
  .label('Verification')
  .trueLabel('Verified')                     // default: 'Yes'
  .falseLabel('Unverified')                  // default: 'No'
  .blankLabel('Pending')                     // default: 'Blank'
  .nullable(false)                           // drop the 'blank' option entirely
```

### Behavior

URL value is one of `'yes' | 'no' | 'blank' | ''`:

| Value   | Default ORM clause          |
|---------|------------------------------|
| `''`    | none (placeholder, "Any")    |
| `yes`   | `where(name, true)`          |
| `no`    | `where(name, false)`         |
| `blank` | `whereNull(name)`            |

`whereNull` is added to the `ModelQuery` interface as an optional method
(rudder ORM already implements it). When absent (e.g. tests using a stub
query), the default handler falls through to `where(name, null)` to keep
the contract loose.

`Filter.query(fn)` overrides the default just like the other filter
types.

### Rendering

Renders as `kind: 'ternary'`. The renderer reuses `FilterSelect` with
the three options derived from `trueLabel / falseLabel / blankLabel` so
no new control is needed. `nullable(false)` drops the `blank` option
client-side AND server-side (don't ship a meta option the user can't
reach).

### Tests

- `toMeta()` emits `kind: 'ternary'` + three options.
- `nullable(false)` drops the `blank` option in meta.
- Default query handler: `yes` → `where(true)`, `no` → `where(false)`,
  `blank` → `whereNull(name)`.
- Falls back to `where(name, null)` when `whereNull` is missing on the query.
- `Filter.query(fn)` override replaces the default branch.

## DateRangeFilter

### API

```ts
DateRangeFilter.make('publishedAt')          // ?publishedAt=2026-01-01..2026-12-31
  .label('Published')
  .includesTime(false)                       // default: false (date-only)
  .minDate('2020-01-01')
  .maxDate(new Date())                       // accepts Date | ISO string
  .placeholder('Any time')                   // default 'Any'
```

### URL shape

A **single URL key** keyed off the filter name, with the value encoded as
`from..to`. Either side may be empty:

```
?publishedAt=2026-01-01..2026-12-31      # closed range
?publishedAt=2026-01-01..                # >= from
?publishedAt=..2026-12-31                # <= to
```

Decision: single-key. The two-key shape (`publishedAt_from / publishedAt_to`)
is cleaner for plain HTML forms but would force `parseFilterValues` to
become filter-aware (multi-key per filter, value-shape branching). That
hurts every other filter type. The single-key/`..`-encoded shape keeps
the existing `Record<string, string>` contract intact and is the same
pattern used by GitHub URL filters and a few other admin frameworks.
The renderer composes the two date inputs into one URL value on change.

### Behavior

Default ORM clauses (skipping the empty side):

| Value                   | Clauses                                 |
|-------------------------|------------------------------------------|
| `2026-01-01..2026-12-31`| `where(name,'>=',from).where(name,'<=',to)` |
| `2026-01-01..`          | `where(name,'>=',from)`                 |
| `..2026-12-31`          | `where(name,'<=',to)`                   |
| `''` or `..`            | none                                    |

When `includesTime(true)`, the renderer surfaces `<input type="datetime-local">`
and the value carries an ISO timestamp; `includesTime(false)` uses
`<input type="date">` and date-only strings (`YYYY-MM-DD`). `to` is
treated as inclusive; the model-adapter applies `<=` (no end-of-day
+1-day fixup — it's the user's column type that decides). Document the
trade-off: for `DateTime` columns with `includesTime(false)`, callers
who want "all of 2026-12-31" should use `Filter.query(fn)` to widen the
upper bound.

`Filter.query(fn)` receives the **encoded string** value as today; users
who want the parsed pair can call the exported helper
`parseDateRangeValue(value) → { from?: string; to?: string }`.

### Rendering

New `kind: 'dateRange'` control: two date inputs side-by-side with a
small `→` separator. Each `onChange` recomputes the encoded value and
SPA-navigates (same `useNavigate` pattern as `FilterSelect`). A "Clear"
× button appears when either side is set; clears the URL key entirely.

`minDate / maxDate` map to the inputs' `min` / `max` attributes; when
absent they're omitted (no client-side bound).

Layout: shares the same `flex flex-col gap-1 text-xs` shell as
`FilterSelect`; date inputs sit in a horizontal row inside the shell so
the filter strip stays uniform-height.

### Tests

- `toMeta()` emits `kind: 'dateRange'` + `includesTime` + optional
  `minDate / maxDate`.
- `parseDateRangeValue` round-trips closed / open-from / open-to / empty.
- Default query handler: closed → two `where` clauses; open-from/to →
  one `where` clause; empty → none.
- `Filter.query(fn)` override sees the raw encoded string.
- `parseFilterValues` mirrors the encoded value onto `Filter.withValue`
  unchanged (no special-casing in the parser).

## Plumbing changes

The widenings are tiny — most of the work is in the two new filter
classes + a renderer branch.

### `Filter.ts`

- Widen `FilterKind` from `'select' | 'boolean'` to
  `'select' | 'boolean' | 'ternary' | 'dateRange'`.
- Drop the source comment that lists future kinds (this plan ships them).

### `orm/modelDefaults.ts` (modelTableRecords + modelRelationTableRecords)

- Add `'ternary'` and `'dateRange'` branches alongside the existing
  `'boolean'` branch in the per-filter loop. **Both adapters update
  symmetrically** — relation managers get range/ternary filters too.
- Add optional `whereNull?(column: string): ModelQuery` to the
  `ModelQuery` interface (mirrors how `withTrashed / onlyTrashed` were
  added in Plan #13).

### `react/SchemaRenderer.tsx`

- `renderFilterControl` switches on `kind`:
  - `'boolean'` → existing 3-option `FilterSelect`.
  - `'ternary'` → 3-option `FilterSelect` with the user-supplied labels.
  - `'select'` → existing data-driven `FilterSelect`.
  - `'dateRange'` → new `FilterDateRange` component (date / datetime
    pair + Clear button).
- `FilterDateRange` follows the same SPA-nav contract: builds a URL,
  resets `?page`, calls `useNavigate`. No fetch round-trip.

### `index.ts`

- Export `TernaryFilter` and `DateRangeFilter` (+ `parseDateRangeValue`).

## Out of scope (deferred)

- **Form-schema filters** (per-filter form pop-out with arbitrary fields).
  Tier-2 line in `admin-gap-audit.md`. Pairs naturally with the
  `actions-tier-1.md` form-modal pattern.
- **Filter `indicator()` / active-filters bar.** Tier-2 UX nicety.
- **`persistFiltersInSession()`.** Tier-3.
- **Multi-select filter.** Mentioned alongside date-range in Phase 3
  memory; same single-key encoding question (`a,b,c`) but a separate
  control. Easy follow-up plan if demand shows up; not bundled here to
  keep this one tight.
- **Number-range filter.** Same shape as `DateRangeFilter`; trivial copy
  once date-range lands. Skipped from v1 to avoid over-fitting to a
  hypothetical caller.

## Implementation map

| Step | File(s) | Notes |
|------|---------|-------|
| 1 | `filters/Filter.ts` | Widen `FilterKind`. |
| 2 | `filters/TernaryFilter.ts` (new) + test | API + default handler. |
| 3 | `filters/DateRangeFilter.ts` (new) + test | API + `parseDateRangeValue` + default handler. |
| 4 | `orm/modelDefaults.ts` | `ternary` / `dateRange` branches in both `modelTableRecords` + `modelRelationTableRecords`. Add `whereNull?` to `ModelQuery`. |
| 5 | `react/SchemaRenderer.tsx` | New `FilterDateRange`, switch in `renderFilterControl`. |
| 6 | `index.ts` | Re-exports. |
| 7 | `playground-pilotiq` | PostResource gains `verified: TernaryFilter` + `publishedAt: DateRangeFilter`. Demo. |
| 8 | `docs/guide/migrating-from-panels.md` | Filter section gains the two new types. |
| 9 | `docs/plans/admin-gap-audit.md` | Mark "TernaryFilter" + "Date-range filter" rows as ✅ DONE. |

## Demo (playground-pilotiq)

Add to `PostResource`:
- `TernaryFilter.make('published').trueLabel('Published').falseLabel('Draft').blankLabel('Scheduled')`
  on a nullable boolean column (or a derived one via `Filter.query(fn)`).
- `DateRangeFilter.make('createdAt').label('Created')` over the existing
  Post.createdAt column. Verify the URL round-trips through SPA nav and
  that `?page` resets on change.

## Testing

Target: ~25 new assertions across the two filter test files + 2-3
integration assertions in `Filter.test.ts` (parser sees the raw value,
`modelTableRecords` applies the right clauses through the existing
mock query). No new test infrastructure.
