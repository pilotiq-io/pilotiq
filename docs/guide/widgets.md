# Widgets

Dashboard primitives — KPI cards, charts, embedded tables, and an
escape hatch to drop into any React component you want. Widgets are
schema **Elements** (not a separate hierarchy), so they compose inside
`Page.schema()`, `Resource.headerSchema()` / `footerSchema()`, and any
container element (`Group`, `Card`, `Section`, `Split`, `Tabs`, …)
without special wiring.

Five built-in elements:

| Element            | Purpose                                                |
|--------------------|--------------------------------------------------------|
| `StatsOverview`    | Row of KPI cards, each described by a `Stat`          |
| `Chart`            | Line / bar / pie / doughnut chart with optional filter |
| `TableWidget`      | Slim "5 newest …" list (no filters / pagination)       |
| `View`             | Mount any React component, fed by `getData(ctx)`       |
| `Stat`             | Fluent value object emitted by `StatsOverview`         |

`Chart` lives in **`@pilotiq/recharts`** — opt-in install so the core
package doesn't carry the recharts dependency.

---

## Quick example

```ts
// app/Pilotiq/Dashboard.ts
import { Page, Heading, Grid, Section, Card, Alert } from '@pilotiq/pilotiq'
import { UsersStats }       from './widgets/UsersStats.js'
import { PostsChart }       from './widgets/PostsChart.js'
import { RecentPosts }      from './widgets/RecentPosts.js'
import { ActivityFeedView } from './widgets/ActivityFeedView.js'

export class MyDashboard extends Page {
  static slug  = ''
  static label = 'Dashboard'
  static icon  = 'layout-dashboard'

  static schema() {
    return [
      Heading.make('Dashboard'),
      UsersStats.make(),

      Card.make('Posts over time').schema([
        PostsChart.make().poll(30),
      ]),

      Grid.make().columns(2).schema([
        Section.make('Recent posts').schema([RecentPosts.make()]),
        Section.make('Activity feed').schema([ActivityFeedView.make()]),
      ]),
    ]
  }
}
```

```ts
// AdminPanel.ts
panel
  .resources([...])
  .pages([MyDashboard, OtherPages])
  .dashboard(MyDashboard)        // marks MyDashboard as the panel root
```

`panel.dashboard(P)` registers the page, auto-adds it to `cfg.pages`,
collapses its sidebar URL to `${base}` (no trailing slug segment), and
routes `${base}` to its `schema()`.

---

## `StatsOverview` and `Stat`

A row of KPI cards. Subclass `StatsOverview` and return an array of
`Stat`s from `getStats(ctx)`:

```ts
import { StatsOverview, Stat } from '@pilotiq/pilotiq'

export class UsersStats extends StatsOverview {
  static override columns = 3

  static override async getStats() {
    return [
      Stat.make('Users')
        .value(await User.query().count())
        .description('total registered')
        .icon('users')
        .color('primary')
        .url('/admin/users'),

      Stat.make('Posts')
        .value(await Post.query().count())
        .icon('file-text')
        .color('success')
        .chart([3, 5, 4, 7, 8, 6, 9]),    // inline-SVG sparkline

      Stat.make('Revenue (MTD)')
        .value('$' + total)
        .description('+12% vs last month')
        .descriptionIcon('trending-up')
        .icon('dollar-sign'),
    ]
  }
}
```

`Stat` fluent surface:

- `.value(v)` — main number / string
- `.description(t)` / `.descriptionIcon(name, position?)` — supplementary line (`'before' | 'after'`, default `'after'`)
- `.icon(name)` — main card icon
- `.color(c)` — `default | primary | success | warning | destructive | info`
- `.chart([n, n, …])` — inline SVG sparkline (no chart-lib dep)
- `.url(href)` / `.openUrlInNewTab(true)` — wraps the card in `<a>`
- `.extraAttributes({...})` — pass-through HTML attrs

---

## `Chart`

Lives in `@pilotiq/recharts`. Install once:

```bash
pnpm add @pilotiq/recharts recharts
```

Register the renderer in your client entry (e.g. `pages/+Layout.tsx`):

```ts
import { registerChartRenderer } from '@pilotiq/recharts'
registerChartRenderer()
```

Without that call, `Chart` widgets render an inline error pointing at
the install command — silent rendering would let a missing
`registerChartRenderer()` slip into production.

```ts
import { Chart } from '@pilotiq/recharts'

export class PostsChart extends Chart {
  static override label   = 'Posts per day'
  static override type    = 'line' as const
  static override color   = 'primary' as const
  static override maxHeight = 280

  static override filters = {
    today: 'Today',
    week:  'Last 7 days',
    month: 'Last 30 days',
  }
  static override defaultFilter = 'week'

  static override async getData(ctx) {
    const days = ctx.filter === 'today' ? 1
              :  ctx.filter === 'month' ? 30
              :  7

    const rows = await Post.query()
      .where('createdAt', '>', new Date(Date.now() - days * 86_400_000))
      .orderBy('createdAt')

    // Bucket by day, then return Chart.js-shaped { labels, datasets }
    return {
      labels:   bucketLabels(rows, days),
      datasets: [{ label: 'Posts', data: bucketCounts(rows, days) }],
    }
  }

  // Escape hatch: raw props passed through to the Recharts component.
  static override options = { strokeWidth: 2, dot: false }
}
```

Selecting a different filter key re-fetches via the same widget endpoint
with `{ filter }` in the request body. `ctx.filter` carries the
selection into `getData`.

**Chart types (8):** `line / bar / pie / doughnut / radar / polar /
scatter / bubble`. v1 ships renderers for `line / bar / pie / doughnut`;
the rest paint a "type not yet supported" panel. Calling `.type('unknown')`
throws at construction.

**Data shape:**

```ts
{
  labels:   ['Mon', 'Tue', 'Wed'],
  datasets: [
    { label: 'Posts', data: [3, 5, 4] },
    { label: 'Drafts', data: [1, 2, 1], color: 'warning' },
  ],
}
```

Chart.js-shaped on purpose — the renderer normalizes to Recharts row
shape internally so existing data-shaping code doesn't have to change
when you swap libraries.

---

## `TableWidget`

Slim list of records — no filters, no bulk actions, no pagination. The
"5 newest posts" pattern. Distinct from the schema-element `Table`,
which drives the full Resource list page.

```ts
import { TableWidget, Column, type ModelQuery } from '@pilotiq/pilotiq'
import { Post } from '#models/Post.js'

export class RecentPosts extends TableWidget {
  static override label      = 'Recent posts'
  static override viewAllUrl = '/admin/posts'    // "View all →" header link
  static override model      = Post

  static override async query(q: ModelQuery) {
    return q.orderBy('createdAt', 'DESC').paginate(1, 5)
  }

  static override columns() {
    return [
      Column.make('title').label('Title').limit(40),
      Column.make('status').label('Status'),
      Column.make('createdAt').label('Created').since(),
    ]
  }
}
```

Resolution falls through:

1. `instance.records(fn)` setter
2. `static records(ctx)`
3. `instance.model(M).query(fn)` setters
4. `static model + static query?(q)` (default `q => q.paginate(1, 5)`)
5. throws if none configured

`Column.formatStateUsing` runs server-side per row and stamps results
under `row._formatted[colName]` — same convention as the full Table.

---

## `View` (escape hatch)

Drops down to a user-supplied React component. Useful for one-offs
(calendar heatmaps, map embeds, custom dataviz) where adding a new
built-in would be overkill.

```ts
// app/Pilotiq/widgets/ActivityFeedView.ts
import { View } from '@pilotiq/pilotiq'

export class ActivityFeedView extends View {
  static override componentName = 'ActivityFeed'

  static override async getData() {
    const recent = await Post.query()
      .orderBy('createdAt', 'DESC')
      .paginate(1, 8)
    return { rows: recent.data.map(toRow) }
  }
}
```

Register the matching component in your client entry:

```ts
// pages/+Layout.tsx
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { ActivityFeed } from '../app/Pilotiq/widgets/ActivityFeed.js'

registerWidgetComponents({ ActivityFeed })
```

Components must accept `{ data?: unknown }` (`WidgetComponent` shape) and
type-guard the payload they actually expect:

```tsx
export function ActivityFeed({ data }: { data?: unknown }) {
  const rows = readRows(data)
  return <ol>{rows.map(/* … */)}</ol>
}

function readRows(data: unknown): ActivityRow[] {
  if (!data || typeof data !== 'object') return []
  const rows = (data as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as ActivityRow[]) : []
}
```

The `componentName` is a registry-lookup key — it does **not** need to
match the JS class name. Renaming the View subclass is safe.

---

## Lazy loading and polling

Every server-data widget element (`StatsOverview`, `Chart`,
`TableWidget`, `View`) is **lazy by default**: the server stamps
`_widgetData[id] = null`, the client paints a skeleton, and the widget
fetches its data on mount via `POST {base}/_widget/:id`.

Opt-out per widget:

```ts
StatsOverview.make().lazy(false)         // resolves synchronously on first paint
```

Auto-refresh by polling on a schedule:

```ts
PostsChart.make().poll(30)               // re-fetch every 30 seconds
```

Polling pauses while `document.visibilityState !== 'visible'` so an
inactive tab doesn't hammer the server. Latest-wins seq tracking drops
stale responses if a slower request resolves after a faster one.

Hooks errors stamp `_widgetData[id] = { error: '…' }` so one flaky
widget doesn't blank out the whole page; the renderer paints an inline
banner and the next polling tick attempts to recover.

---

## Authorization

Widgets inherit `Element.visible(rule)` from Plan #8 — no new
`canView` predicate. Both the SSR pass and the polling endpoint
re-evaluate the rule:

```ts
StatsOverview.make().visible(({ user }) => user?.role === 'admin')
```

The polling route `403`s when the predicate fails, so a hidden widget
can't be re-fetched by URL probing. The rule's context exposes `user`
(opaque, set via `panel.user(req => …)`), `record` / `records`, and the
shared `RenderContext`.

`Page.canView(user)` (Plan #10) gates the page itself before any widget
resolves.

---

## Resource header / footer schemas

Drop widgets above or below the list table for a Resource:

```ts
export class PostResource extends Resource {
  static override headerSchema() {
    return [
      Grid.make().columns(2).schema([
        PostsThisWeek.make(),
        DraftCount.make(),
      ]),
      Alert.make('Editorial calendar locked through Friday').info(),
    ]
  }

  static override footerSchema() {
    return [LongestRunningPostsTable.make()]
  }
}
```

Both hooks are async-aware. Widget endpoints are scoped to the resource
(`POST {base}/{slug}/_widget/:id`) so `R.canAccess + R.canViewAny` run
in front of the per-widget visibility check.

---

## Custom widgets

For a truly bespoke widget that doesn't fit the existing built-ins —
e.g. a calendar heatmap with its own polling cadence — extend `View`
or, if you need the widget surface (filters dropdown, multiple
renderers, a registry), extend `ServerDataElement` directly:

```ts
import { ServerDataElement, registerWidgetRenderer } from '@pilotiq/pilotiq'

export class CalendarHeatmap extends ServerDataElement {
  getType() { return 'calendarHeatmap' }
  toMeta() { return { type: 'calendarHeatmap' } }
  async resolveServerData(ctx) {
    return { days: await Activity.query().last(365).countByDay() }
  }
}

// pages/+Layout.tsx (or any client entry)
import { CalendarHeatmapRenderer } from './CalendarHeatmapRenderer'
registerWidgetRenderer('calendarHeatmap', CalendarHeatmapRenderer)
```

Renderers consume the same `useWidgetData(meta)` hook the built-ins
use:

```tsx
import { useWidgetData } from '@pilotiq/pilotiq/react'

export function CalendarHeatmapRenderer({ meta }) {
  const { data, error, isLoading } = useWidgetData(meta)
  if (isLoading) return <Skeleton />
  if (error)     return <ErrorPanel msg={error} />
  return <Heatmap days={data.days} />
}
```

The same renderer registry powers `@pilotiq/recharts`. Extend it the
same way to ship a `@pilotiq/echarts` or `@pilotiq/chartjs` adapter.

---

## What's not in v1

- **Page-level filter form** (Filament's `HasFiltersForm` /
  `persistsFiltersInSession`). Workaround: drop a `Form.live()` element
  at the top of `Page.schema()` and have widgets read upstream filter
  state via `$get`.
- **Drag-to-rearrange dashboards** and per-user saved layouts.
- **Responsive `columns([md => 2, xl => 4])`** — int-only for v1
  (mirrors Repeater `grid()` posture).
- **Widget caching layer** (`Element.cache(ttl)`) — wrap your own
  `getData` body in `@rudderjs/cache` if a slow query is blocking
  page render.
- **Remaining 4 chart types** (radar / polar / scatter / bubble) —
  v1 ships line / bar / pie / doughnut renderers; the rest land as
  Recharts mappings.
