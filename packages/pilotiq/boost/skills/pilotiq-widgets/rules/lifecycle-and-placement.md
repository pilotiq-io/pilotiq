# Widget lifecycle & placement

## Lifecycle — you don't wire fetching

Every widget element carries three things automatically:

- **`serverData: true`** — the data hook (`getStats` / `records` / `getData`) runs server-side during the page resolve. First paint reads that SSR slot — no loading flash for the initial render.
- **`lazy: true` (default)** — after mount the client refetches via the scope's widget endpoint, so a widget can be heavier than the rest of the page without blocking SSR. Set per-element if you need eager-only.
- **`.poll(seconds)`** — re-fetch on an interval. Paused automatically while `document.visibilityState !== 'visible'`. Latest-wins sequencing drops stale responses.

```ts
StatsOverview.make('live').poll(30).getStatsHandler(async () => […])
```

The client hook `useWidgetData` owns initial-slot read, lazy mount-fetch, polling, and error-sentinel round-tripping. You never write a `useEffect` / `fetch` for a widget. A hook that throws server-side surfaces as an inline error panel, not a page crash.

## Placement — three scopes, no route wiring

Where you put the widget Element decides its scope and which endpoint serves its lazy/poll refetches (all auto-registered):

**Panel (dashboard).** `Pilotiq.dashboard(MyDashboardPage)` — the page's `schema()` holds the widgets; its nav collapses to the panel base URL.

```ts
export class MyDashboard extends Page {
  static override slug = ''                 // convention: dashboard owns the base URL
  static override schema() {
    return [ new UsersStats(), new RecentPosts(), new ActivityFeedView() ]
  }
}
Pilotiq.make('Admin').path('/admin').dashboard(MyDashboard) /* … */
```

Endpoint: `POST {base}/_widget/:id`.

**Page (custom Page).** Any custom Page's `schema()` can hold widgets — same as the dashboard but at the page's own URL. Endpoint: page-scoped `_widget/:id`.

**Resource (header / footer).** Mount widgets above / below a resource list:

```ts
export class OrderResource extends Resource {
  static override headerSchema() { return [ new OrderStats() ] }   // above the table
  static override footerSchema() { return [ new RevenueChart() ] } // below the table
}
```

Endpoint: `POST {base}/{slug}/_widget/:id`, gated by `R.canAccess + R.canViewAny` before the widget's own visibility check.

## Notes

- Widget `id` auto-derives from the subclass class name when you don't pass one to `.make(id)`; keep ids unique within a page so polling/lazy fetches address the right widget.
- Widgets honor `visible() / hidden()` like any Element (layout-level), so you can gate a card on `ctx.user`.
- Cost: each widget's hook runs once on SSR + once per lazy mount + once per poll tick. Heavy queries → prefer `lazy` (default) and a sane `.poll()` interval, or skip polling.
