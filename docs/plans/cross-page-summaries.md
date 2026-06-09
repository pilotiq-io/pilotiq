# Plan — Cross-page table summaries

**Status:** SHIPPED 2026-06-09 (changeset `cross-page-summaries`, minor). Default =
cross-page for model-backed tables (Filament parity). Tests: `summarizers/Summarizer.test.ts`
(contract), `orm/tableSummaries.test.ts` (helper), `elements/dispatchTable.test.ts` (dispatcher
prefer + per-column fallback). Live-verified rudder 1.20.0 exposes the scalar terminals.
**Package:** `@pilotiq/pilotiq`
**Size:** M (1 commit, 1 changeset)

## Problem

`Column.summarize([Sum, Average, …])` is **per-page only** today. `loadTableRecords`
computes each summarizer over the rows it just rendered (`dispatchTable.ts:721–760`), so a
"Total" in the `<tfoot>` totals the visible 15 rows, not the full filtered set. A user
filtering 4,000 invoices to "unpaid" and reading the Total sum sees the sum of page 1 — a
silently wrong number. Filament summaries are over the **full filtered query** by default;
this closes that gap.

## Capability check (done)

Installed `@rudderjs/orm@1.20.0` exposes scalar aggregate terminals on the query builder —
`count(): Promise<number>`, `sum(col)`, `avg(col)`, `min(col)`, `max(col)` (orm
`dist/index.d.ts:720–727`). So the "2nd aggregate query" is **real SQL aggregation**, not a
fetch-all-rows reduce. **No upstream rudder plan needed.**

## Design

### 1. Where the aggregate query runs

The filtered/searched/tabbed/scoped query is built inside the records handler
`modelTableRecords` (`orm/modelDefaults.ts:346–408`), NOT in `loadTableRecords` — the
dispatcher only sees the returned `{ rows, total }`. So the aggregate query must run where the
query lives: **inside the records handler**, and ride back on the result.

Extract the filter-building block (`modelDefaults.ts:355–397` — search + filters + tab +
groupScope, **minus** sort + paginate) into a reusable:

```ts
function buildScopedQuery(R, table, ctx): ModelQuery   // fresh, filtered, no sort/pagination
```

Call it once for the page query (then `.orderBy().paginate()`), and once per aggregate
(fresh builder each time — scalar terminals execute, can't be reused).

### 2. Summarizer contract — split "what aggregate" from "how to format"

Current `Summarizer.compute(values: unknown[]): string` is array-based (per-page). Add a
SQL-side pair to the base class, keeping `compute` for the fallback path:

```ts
type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count'

abstract aggregates(): ReadonlyArray<AggregateFn>          // SQL fns this summarizer needs
abstract resultFromScalars(s: Partial<Record<AggregateFn, number | null>>): SummaryResult
```

| Summarizer | `aggregates()`   | `resultFromScalars`                                   |
|------------|------------------|-------------------------------------------------------|
| `Sum`      | `['sum']`        | `formatNumber(s.sum ?? 0)`                             |
| `Average`  | `['avg']`        | `formatNumber(s.avg ?? 0)`                             |
| `Count`    | `['count']`      | `String(s.count ?? 0)`                                 |
| `Range`    | `['min','max']`  | `s.min==null ? '—' : ${fmt(min)}..${fmt(max)}`        |

`label` / `format` / `toMeta` / `formatNumber` unchanged — both paths share them.

### 3. Records handler computes summaries

In `modelTableRecords`, after building the page result, gather
`table.getColumns().filter(c => c.hasSummarizers())`. For each, take the **union** of
`aggregates()` across its summarizers (dedup — `Range` shares nothing, but two summarizers
needing `sum` run it once), run each scalar terminal on a fresh `buildScopedQuery`, then map
each summarizer through `resultFromScalars`. Stamp onto the widened result:

```ts
interface TableRecordsResult<R> { rows: R[]; total?: number;
  summaries?: Record<string, SummaryResult[]> }   // NEW, optional
```

`count` short-circuits to `result.total` (already a COUNT) — no extra query.

**Per-column try/catch fallback:** virtual / `formatStateUsing` / relationship columns aren't
real DB columns — `q.sum('virtualCol')` throws. Wrap each column's aggregation; on throw,
**omit that column** from `result.summaries`. The dispatcher then fills it per-page (below),
so one un-aggregatable column degrades gracefully instead of 500-ing the table.

### 4. Dispatcher consumes, falls back per-column

`loadTableRecords` (`dispatchTable.ts:726–733`): if `result.summaries?.[col.name]` exists, use
it (cross-page); else compute from `finalRows` (existing per-page path, unchanged). Same
per-column merge keeps custom `records()` handlers (no `summaries` on their result) on the
current per-page behavior automatically.

### Default vs opt-in

**Recommendation: cross-page is the DEFAULT for model-backed tables** (Filament parity, no new
API — a `.summarize()` on a resource list just becomes correct). Custom `records()` handlers
and un-aggregatable columns transparently fall back to per-page. The alternative — a
`.summarizeAcrossPages()` opt-in — keeps the (arguably-buggy) per-page total as the default;
rejected unless we want zero behavior change for existing summaries.

## Scope / deferrals (v1)

- **Global `<tfoot>` only.** Per-group summaries (`groupSummaries`, banded rows) stay per-page
  in v1 — cross-group needs `GROUP BY` + scalar selects per bucket. Document the asymmetry;
  fast-follow.
- **Relation-manager tables** (`modelRelationTableRecords`, `modelDefaults.ts:697`) stay
  per-page in v1 — same `buildScopedQuery` extraction applies, include only if cheap.
- **One query per (column, aggregate-fn).** A typical table = a few queries. `selectRaw` to
  collapse into one `SELECT SUM(),AVG(),MIN(),MAX() …` per column is a later optimization.

## Touch list

- `summarizers/Summarizer.ts` — `aggregates()` + `resultFromScalars()` on base + 4 subclasses.
- `elements/Table.ts` — widen `TableRecordsResult` with optional `summaries`.
- `orm/modelDefaults.ts` — extract `buildScopedQuery`; compute summaries in
  `modelTableRecords` (and maybe `modelRelationTableRecords`).
- `elements/dispatchTable.ts` — prefer `result.summaries`, per-column per-page fallback.
- Tests: `summarizers/Summarizer.test.ts` (new contract), `dispatchTable.test.ts` (cross-page
  via a fake records handler returning `summaries`, plus fallback when absent).
- Docs: `Column.summarize` note in `packages/pilotiq/CLAUDE.md` + the table guide.

## Risks

- Aggregate over a non-numeric column returns DB-defined results (SUM of text) — same as
  Filament; user attaches numeric summarizers to numeric columns. Not guarded.
- Cross-page summary reflects the **filtered** set (correct), so it changes as filters change —
  intended, matches the page rows' scope.
