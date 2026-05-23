# @pilotiq/recharts

## Overview

Recharts dashboard chart adapter for `@pilotiq/pilotiq`. Adds the `Chart` widget element so panels can ship line / bar / pie / doughnut charts on dashboards, resource header / footer schemas, and custom pages. Each chart is a `ServerDataElement` — `getData(ctx)` runs server-side, optional polling refreshes via the widget endpoint.

Separate package because Recharts is ~80 KB after tree-shake plus a non-trivial React-DOM render path — pulling it into the host would tax panels that don't draw charts. A future `@pilotiq/chartjs` or `@pilotiq/echarts` slots into the same renderer registry without core churn.

## Setup

```bash
pnpm add @pilotiq/recharts recharts
```

Register the plugin on the panel:

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { recharts } from '@pilotiq/recharts'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .plugins([recharts()])
```

Without registration, every `Chart` widget paints a clear inline error rather than silently rendering nothing — missing registration in production is loud, not subtle:

```
No renderer registered for widget type `chart`. Install @pilotiq/recharts
and call registerChartRenderer() at app boot.
```

## Key Patterns

### Defining a chart

`Chart` is a class — subclass it and declare statics:

```ts
import { Chart } from '@pilotiq/recharts'
import { Post } from '../Models/Post.js'

export class PostsChart extends Chart {
  static override label     = 'Posts per day'
  static override type      = 'line' as const
  static override color     = 'primary' as const
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

    return {
      labels:   bucketLabels(rows, days),
      datasets: [{ label: 'Posts', data: bucketCounts(rows, days) }],
    }
  }
}
```

Mount inside any `Page.schema()` / `Resource.headerSchema()` / `Resource.footerSchema()`:

```ts
class DashboardPage extends Page {
  static override schema(ctx) {
    return [
      Heading.make('Dashboard'),
      Grid.make().columns(2).schema([
        PostsChart.make().poll(30),                  // auto-refresh every 30s
        SignupsChart.make(),
      ]),
    ]
  }
}
```

### Chart types

v1 ships four renderers; the type whitelist accepts four more for forward compat:

| Type | v1 renderer | Notes |
|---|---|---|
| `line` | ✅ | Default |
| `bar` | ✅ | Vertical bars |
| `pie` | ✅ | Standard pie slices |
| `doughnut` | ✅ | Pie with inner radius |
| `radar` | later | |
| `polar` | later | |
| `scatter` | later | |
| `bubble` | later | |

Calling `.type('unknown')` (or setting `static type = 'unknown'`) throws at construction time — typos surface at schema build, not at first render.

### Data shape

Chart.js-shaped — the renderer normalizes to Recharts internally so swapping adapters later doesn't require reshaping the data:

```ts
{
  labels:   ['Mon', 'Tue', 'Wed'],
  datasets: [
    { label: 'Posts',  data: [3, 5, 4] },
    { label: 'Drafts', data: [1, 2, 1], color: 'warning' },
  ],
}
```

Per-dataset `color` is a `ChartColor` token: `primary` / `success` / `warning` / `destructive` / `info` / `default`. Resolution: per-dataset `color` → explicit (non-`default`) chart-level `static color` for the first series → otherwise the **theme chart palette** (`--chart-1`…`--chart-5`, by series index). Leave both unset so charts track the theme editor's "Chart Color" setting. Chrome is minimal: lines render as soft area-fills, bars get rounded tops, no value-grid — hairline X baseline + muted labels only.

For pie / doughnut, the single dataset's `data` array maps positionally to `labels`:

```ts
{
  labels:   ['Drafts', 'Published', 'Archived'],
  datasets: [{ label: 'Posts', data: [12, 87, 5] }],
}
```

### Fluent form (no subclass)

For one-off charts that don't need a class:

```ts
Chart.make('signups-by-source')
  .label('Signups by source')
  .type('pie')
  .color('primary')
  .maxHeight(240)
  .getData(async (ctx) => ({
    labels:   ['Direct', 'Search', 'Referral'],
    datasets: [{ label: 'Count', data: [42, 87, 23] }],
  }))
```

The fluent form is sugar over the class form — same `ServerDataElement` lifecycle, same wire shape. Use the class form for charts you reuse; fluent for one-offs.

### Per-chart filter dropdown

`static filters = { key: label }` renders a `<select>` in the chart's header. The selected key rides on `ctx.filter` so `getData` can branch on it; switching options re-fetches via the polling endpoint with `{ filter }` in the request body.

`static defaultFilter` controls the initial selection on the first SSR pass — set it to one of the keys from `filters` (otherwise the SSR run sees `ctx.filter === undefined` and you have to handle the fallback explicitly).

```ts
class RevenueChart extends Chart {
  static override filters = {
    daily:   'Daily',
    weekly:  'Weekly',
    monthly: 'Monthly',
  }
  static override defaultFilter = 'weekly'

  static override async getData(ctx) {
    const bucket = ctx.filter ?? 'weekly'         // defensive — defaultFilter handles SSR
    return loadRevenue(bucket)
  }
}
```

### Polling

```ts
PostsChart.make().poll(30)                         // refresh every 30 seconds
PostsChart.make().poll(null)                       // disable polling (default)
```

The widget endpoint (`POST {base}/_widget/:id` for panel-scope, `POST {base}/{slug}/_widget/:id` for resource-scope) re-runs `getData(ctx)` and returns fresh data. Polling pauses while the tab is hidden (`document.visibilityState !== 'visible'`).

### Resource header / footer placement

Charts mount inside any schema-returning hook, including `Resource.headerSchema()` and `Resource.footerSchema()` — useful for per-resource summary widgets above the list:

```ts
class PostResource extends Resource {
  static override headerSchema(ctx) {
    return [
      Grid.make().columns(2).schema([
        PostsChart.make().poll(30),
        TopAuthorsChart.make(),
      ]),
    ]
  }
}
```

Resource-scope widget routes auto-register at `POST {base}/{slug}/_widget/:id` and run `R.canAccess + R.canViewAny` before the widget's visibility check.

### Escape hatch: raw Recharts options

```ts
class CustomChart extends Chart {
  static override type    = 'line' as const
  static override options = {
    strokeWidth:        2,
    dot:                false,
    isAnimationActive:  false,
  }
}
```

`options` is spread onto the renderer's primary `<Line>` / `<Bar>` / `<Pie>` component. Use for tweaks beyond the curated fluent surface — anything Recharts accepts works.

### Visibility + authorization

Charts respect the same `.visible(rule)` / `.hidden(rule)` Element-level rules as any other schema element. For data access, the `getData(ctx)` handler runs server-side with `ctx.user` available — gate inside the handler:

```ts
static override async getData(ctx) {
  if (!ctx.user || ctx.user.role !== 'admin') {
    return { labels: [], datasets: [] }            // empty data — chart renders, no info leak
  }
  return loadAdminStats()
}
```

For resource-scope charts (header / footer schemas), the framework already runs `R.canAccess + R.canViewAny` before the widget endpoint fires — `ctx.user` won't be unauthorized at that level.

## Common Pitfalls

- **Forgetting `.plugins([recharts()])`** — every `Chart` widget paints a clear "No renderer registered" inline error. Loud-by-design (silent rendering would let missing registration slip into prod).
- **`recharts` peer dep version mismatch** — the package declares Recharts as a peer; install the version your app pins. Major Recharts upgrades occasionally change component APIs (`<LineChart>` props) — `static options` passthrough may need updates.
- **Forgetting `static defaultFilter` when `filters` is set** — on first SSR, `ctx.filter` is `undefined` if no default is declared. Either set `static defaultFilter = 'someKey'` or `?? 'someKey'` inside `getData`.
- **Chart data shape vs Recharts native shape** — the framework normalizes Chart.js-shaped `{ labels, datasets }` into Recharts internally. Don't try to pass Recharts native props directly via `static data` — use the Chart.js shape, then use `static options` for renderer tweaks.
- **`.poll(seconds)` granularity** — minimum useful interval is ~5 seconds; sub-second polling hammers the widget endpoint. For real-time updates, the broadcast pattern via `@rudderjs/broadcast` is the right tool, not polling.
- **`@pilotiq/recharts` peer dep on host** — declares `@pilotiq/pilotiq` as a peer with the literal range `">=0.7.0 <1.0.0"` (not `workspace:^`). Pre-1.0 caret on workspace:^ would break on every pilotiq minor bump.
- **Pie / doughnut with multiple datasets** — only the first dataset renders; pie semantically can't represent two parallel series. Use bar with two datasets for "compare two distributions" UX.

## Key Imports

```ts
import {
  Chart,                      // base class + fluent factory
  recharts,                   // plugin factory for .plugins([])
  registerChartRenderer,      // installs the renderer (alternative to .plugins([recharts()]))
} from '@pilotiq/recharts'

import type {
  ChartType,                  // 'line' | 'bar' | 'pie' | 'doughnut' | …
  ChartColor,                 // 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'default'
  ChartData,                  // { labels: string[]; datasets: ChartDataset[] }
  ChartDataset,
  ChartContext,               // { filter?: string; user?; basePath; record?; … }
} from '@pilotiq/recharts'
```
