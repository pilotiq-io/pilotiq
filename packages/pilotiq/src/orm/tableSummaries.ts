import type { Table } from '../elements/Table.js'
import type { SummaryResult, AggregateFn } from '../summarizers/Summarizer.js'
import type { ModelQuery } from './modelDefaults.js'

/**
 * Compute cross-page column summaries — the `Column.summarize([…])` values
 * over the FULL filtered set rather than just the rendered page.
 *
 * `makeScopedQuery` returns a FRESH query with the page's search / filters /
 * active-tab / group-drill scope applied but WITHOUT sort or pagination. A
 * fresh one is built per aggregate because scalar terminals execute — a
 * builder can't be reused once `.sum()` etc. has run. `total` is the
 * paginator's filtered row count, reused for `count` so a `Count` summarizer
 * costs no extra query.
 *
 * Returns a per-column `SummaryResult[]` map, or `undefined` when no column
 * has summarizers OR the builder lacks scalar-aggregate terminals (test stubs
 * / bare drivers) — in which case the caller leaves every column to the
 * per-page fallback in `loadTableRecords`. Per-column try/catch: an aggregate
 * that throws (virtual / `formatStateUsing` / relationship columns aren't real
 * DB columns) omits THAT column from the map, so the dispatcher fills it
 * per-page — one un-aggregatable column never sinks the whole table.
 */
export async function computeCrossPageSummaries(
  table:           Table,
  total:           number | undefined,
  makeScopedQuery: () => ModelQuery,
): Promise<Record<string, SummaryResult[]> | undefined> {
  const columns = table.getColumns().filter(c => c.hasSummarizers())
  if (columns.length === 0) return undefined

  // Probe once — if the builder can't do scalar aggregates, skip the whole
  // cross-page path and let every column fall back to per-page.
  const probe = makeScopedQuery()
  const canAggregate =
    typeof probe.sum === 'function' &&
    typeof probe.avg === 'function' &&
    typeof probe.min === 'function' &&
    typeof probe.max === 'function'
  if (!canAggregate) return undefined

  const out: Record<string, SummaryResult[]> = {}

  await Promise.all(columns.map(async (col) => {
    const summarizers = col.getSummarizers()

    // Union of the aggregate fns this column's summarizers need, so two
    // summarizers both wanting `sum` (or `min`) issue one query, not two.
    const needed = new Set<AggregateFn>()
    for (const s of summarizers) for (const fn of s.aggregates()) needed.add(fn)

    try {
      const scalars: Partial<Record<AggregateFn, number | null>> = {}
      await Promise.all([...needed].map(async (fn) => {
        if (fn === 'count') { scalars.count = total ?? 0; return }
        const q = makeScopedQuery()
        // Presence guaranteed by the probe above.
        const run = q[fn] as (column: string) => Promise<number | null>
        scalars[fn] = await run.call(q, col.name)
      }))
      out[col.name] = summarizers.map(s => s.resultFromScalars(scalars))
    } catch {
      // Column isn't aggregatable in SQL — omit so the dispatcher computes
      // this one over the rendered page instead.
    }
  }))

  return Object.keys(out).length > 0 ? out : undefined
}
