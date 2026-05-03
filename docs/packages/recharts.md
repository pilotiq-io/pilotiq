# @pilotiq/recharts

Recharts dashboard chart adapter for `@pilotiq/pilotiq`. Adds the
`Chart` widget element + a renderer registry hook so your panel can
ship line / bar / pie / doughnut charts on dashboards, resource
header/footer schemas, and custom pages.

## Why a separate package?

Recharts is ~80 KB after tree-shaking and brings in a non-trivial
React-DOM render path. Pulling it into `@pilotiq/pilotiq` would tax
panels that don't draw charts — the same posture as `@pilotiq/tiptap`
(rich text) and `@pilotiq/codemirror` (code editing).

A future `@pilotiq/chartjs` or `@pilotiq/echarts` slots in via the same
renderer registry without core churn.

## Installation

```bash
pnpm add @pilotiq/recharts recharts
```

`recharts` is a peer dependency — install the version your app pins.

## Setup

One-time call in your client entry (e.g. `pages/+Layout.tsx`):

```ts
import { registerChartRenderer } from '@pilotiq/recharts'

registerChartRenderer()
```

Without this call, every `Chart` widget paints a clear inline error:

> No renderer registered for widget type `chart`. Install
> `@pilotiq/recharts` and call `registerChartRenderer()` at app boot.

Silent rendering would let a missing registration slip into production
unnoticed.

## Quick example

```ts
import { Chart } from '@pilotiq/recharts'
import { Post } from '#models/Post.js'

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

    return {
      labels:   bucketLabels(rows, days),
      datasets: [{ label: 'Posts', data: bucketCounts(rows, days) }],
    }
  }
}
```

Mount it inside any `Page.schema()` or `Resource.headerSchema()`:

```ts
PostsChart.make().poll(30)         // auto-refresh every 30 seconds
```

## Chart types

Eight types are accepted by the type whitelist; v1 ships renderers for
the first four:

| Type      | v1 renderer | Notes                         |
|-----------|-------------|-------------------------------|
| `line`    | ✅           | Default                       |
| `bar`     | ✅           | Vertical bars                 |
| `pie`     | ✅           | Standard pie slices           |
| `doughnut`| ✅           | Pie with `innerRadius`        |
| `radar`   | (later)     | Recharts `<Radar>` mapping    |
| `polar`   | (later)     | Polar-area variant of radar   |
| `scatter` | (later)     | XY scatter                    |
| `bubble`  | (later)     | Scatter with size axis        |

Calling `.type('unknown')` throws at construction so typos surface at
schema build, not at render.

## Data shape

Chart.js-shaped — the renderer normalizes to Recharts internally so
existing data-shaping code doesn't need to change if you swap to a
different chart adapter later:

```ts
{
  labels:   ['Mon', 'Tue', 'Wed'],
  datasets: [
    { label: 'Posts',  data: [3, 5, 4] },
    { label: 'Drafts', data: [1, 2, 1], color: 'warning' },
  ],
}
```

`color` per dataset is a `ChartColor` token (`primary`, `success`,
`warning`, `destructive`, `info`, `default`). When omitted, the chart
falls through to the chart-level `static color` and then to the
panel's color tokens.

## Per-chart filter dropdown

`static filters = { key: label }` renders a `<select>` in the chart's
header. The selected key rides on `ctx.filter` so `getData` can branch
on it; switching options re-fetches via the polling endpoint with
`{ filter }` in the request body.

`static defaultFilter` controls the initial selection on the first
SSR pass — set it to one of the keys from `filters` (otherwise the
SSR run sees `ctx.filter === undefined` and you'll have to handle that
fallback explicitly).

## Escape hatch: raw Recharts options

```ts
static override options = { strokeWidth: 2, dot: false, isAnimationActive: false }
```

`options` is spread onto the renderer's primary `<Line / Bar / Pie>`
component. Use this for tweaks beyond the curated fluent surface
(`label / type / color / maxHeight / filters`) — anything Recharts
accepts works.

## Tests

`pnpm -F @pilotiq/recharts test` — 22 tests covering the Chart fluent
surface, the static-form fall-through, the type whitelist, server-data
resolution with default-filter fallback, and registration.
