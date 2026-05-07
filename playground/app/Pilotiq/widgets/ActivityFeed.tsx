/**
 * Plan #15 demo — `View` widget renderer (escape-hatch component).
 *
 * The `View.ActivityFeed` element resolves `getData(ctx)` server-side
 * and ships the result on `_widgetData[id]`. Core's `ViewRenderer`
 * looks up this component by name through `getWidgetComponent('ActivityFeed')`
 * (see `+Layout.tsx`'s `registerWidgetComponents` call) and mounts it
 * with the resolved data.
 *
 * Anything goes here — the View widget exists so panels can drop in
 * one-off React (calendar heatmaps, map embeds, custom dataviz, …)
 * without inventing new built-ins for every shape.
 */

interface ActivityRow {
  title:    string
  status:   string
  ago:      string
}

// Props match the `WidgetComponent` shape (`{ data?: unknown }`) so
// this component type-checks against `registerWidgetComponents`. The
// type guard below narrows the shape we actually expect.
export function ActivityFeed({ data }: { data?: unknown }) {
  const rows = readRows(data)
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        No recent activity.
      </div>
    )
  }
  return (
    <ol className="rounded-md border border-border bg-card divide-y divide-border">
      {rows.map((row: ActivityRow, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 truncate font-medium text-foreground">
            {row.title}
          </div>
          <div className="flex items-baseline gap-3 text-xs">
            <span
              className={
                row.status === 'published'
                  ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300'
                  : 'rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300'
              }
            >
              {row.status}
            </span>
            <span className="text-muted-foreground">{row.ago}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function readRows(data: unknown): ActivityRow[] {
  if (!data || typeof data !== 'object') return []
  const rows = (data as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as ActivityRow[]) : []
}
