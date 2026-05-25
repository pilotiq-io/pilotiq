# Stat & StatsOverview — KPI cards

`StatsOverview` renders a responsive row of KPI cards. Each card is a `Stat`
value object (not an Element — it has no place in the schema tree; the
overview emits it).

## Subclass form (recommended for real data)

```ts
import { StatsOverview, Stat } from '@pilotiq/pilotiq'

export class UsersStats extends StatsOverview {
  static override columns = 3                 // cards per row (responsive grid)

  static override async getStats(ctx) {
    const total  = await User.query().count()
    const active = await User.query().where('active', true).count()
    return [
      Stat.make('Total users').value(total).description('All time')
        .icon('users').color('primary'),
      Stat.make('Active').value(active).description('Last 30 days')
        .descriptionIcon('trending-up', 'before').color('success'),
      Stat.make('Churn').value('2.4%').description('vs last month')
        .descriptionIcon('trending-down').color('destructive')
        .chart([12, 9, 11, 7, 6, 4]),         // sparkline
    ]
  }
}
```

## Fluent form (inline, no class)

```ts
StatsOverview.make('users-stats')
  .columns(3)
  .getStatsHandler(async (ctx) => [ Stat.make('Total').value(42) ])
```

## `Stat` setters

```ts
Stat.make(label)
  .value(v)                          // the big number / string
  .description(text)                 // small line under the value
  .descriptionIcon(name, position?)  // 'before' (default) | 'after'
  .icon(name)                        // leading icon on the card
  .color('primary'|'success'|'warning'|'destructive'|'info'|…)
  .chart([n, n, …])                  // inline sparkline (area-fill, theme palette)
  .url(href).openUrlInNewTab()       // make the whole card a link
  .extraAttributes({ … })            // passthrough data-* / aria-*
```

- `getStats(ctx)` is **async** and runs server-side — query your models directly. Resolved `Stat`s serialize to `StatMeta[]`; the renderer never touches your class.
- `columns` is the cards-per-row count; the grid is responsive (collapses on narrow screens).
- Sparkline colors and the card accent follow the active theme palette (`--chart-1..5`) by default — see `pilotiq-theme`. Set `.color()` for a fixed accent.
- A `Stat` is a value object: you only ever return `Stat`s from `getStats` / `getStatsHandler`; you never put a `Stat` in a page schema directly. The `StatsOverview` is the Element you place.

See `rules/lifecycle-and-placement.md` for `lazy` / `.poll()` and where to mount the `StatsOverview`.
