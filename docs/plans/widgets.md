---
name: Widgets
description: Plan #15 — dashboard widgets as schema elements. Stat, StatsOverview, Chart, Table, View are Element subclasses composing inside Page.schema() and Resource.headerSchema/footerSchema. No Widget base class, no DashboardPage. Recharts as adapter package (@pilotiq/recharts) mirrors @pilotiq/tiptap and @pilotiq/codemirror. Filament v5 parity for Stat/Chart configuration.
type: plan
---

# Widgets

Dashboard widgets — KPI cards, charts, embedded tables, and
custom-render escape hatches. The next "feature pillar" after
Repeater/Builder polish closed: today pilotiq has Resources (CRUD lists)
and custom Pages but no first-class story for dashboard primitives.
Filament's `Widget` family covers this and is what users coming from
Laravel admin land expect on day 1.

**Design call: widgets are schema Elements, not a parallel hierarchy.**

Filament v3+ moved widgets toward unified Schema components, and
pilotiq is already schema-driven (`Page.schema()`,
`Resource.form().schema()`, layout primitives like `Group / Card /
Section`). A separate `Widget` base + `DashboardPage` + `widgets()`
method would be a parallel hierarchy that doesn't pay for itself.

This plan adds **five new Element subclasses** (`Stat`, `StatsOverview`,
`Chart`, `Table`, `View`), **two new Resource hooks** (`headerSchema`
/ `footerSchema`), **one panel-level sugar** (`panel.dashboard(MyPage)`
to mark the homepage), **one polling route** (`POST {base}/_widget/:id`),
and **one adapter package** (`@pilotiq/recharts` — opt-in install for
chart rendering).

## Status

| Step | Status | Notes |
|---|---|---|
| 1. Server-data Element contract | ✅ DONE 2026-05-03 | `ServerDataElement` abstract subclass + `isServerDataElement()` structural check + `stampServerDataMeta()` resolver hook. `poll(seconds)` / `lazy(bool=true)` / `id(string)` setters; default `isLazy()` = true. Resolver auto-stamps `serverData / id / poll / lazy` on every server-data element's meta. |
| 2. `View` element (escape-hatch) | ✅ DONE 2026-05-03 | `View` extends `ServerDataElement`. `static componentName` + `static getData(ctx)` for subclass form; `.component(name) / .getDataHandler(fn)` fluent setters. Component lookup via `@pilotiq/pilotiq/widgets` runtime registry (`registerWidgetComponents({ Name: Component })`). |
| 3. `panel.dashboard(MyPage)` sugar | ✅ DONE 2026-05-03 | `Pilotiq.dashboard(P)` stores `cfg.dashboardPage`, auto-adds to `cfg.pages` (no dupes). `dashboardData()` resolves P's schema instead of `cfg.schema`. `panelInfo()` collapses the dashboard page nav URL to `${base}`. Routes skip the dashboard in the custom-pages loop to avoid `${base}/${slug}` collision. |
| 4. Polling route | ✅ DONE 2026-05-03 | `POST {base}/_widget/:id` (panel scope) and `POST {base}/{pageSlug}/_widget/:id` (page scope). `widgetData()` builder re-resolves the schema, finds widget by id, fail-closes via `evaluateVisibility` (403). `body.filter` rides on `RenderContext.filter`. Resource-scoped widget endpoint deferred to Phase E. |
| 5. Lazy-loading wire | ✅ DONE 2026-05-03 | `resolveServerDataElements(elements, ctx)` in `pageData.ts` walks the tree, runs hooks in parallel, stamps `_widgetData[id]`. Lazy widgets stamp `null` (renderer paints skeleton, fetches on mount via the polling endpoint). Per-widget hook errors stamp `{ error: '...' }` so one flake doesn't blank the page. Walker stops at `form / repeater / builder / table` containers — widgets-inside-arrays not supported in v1. |
| 6. `Stat` value object + `StatsOverview` element | ✅ DONE 2026-05-03 cont'd | `Stat.make(label).value / description / descriptionIcon(icon, position='after') / icon / color / chart([n…]) / url / openUrlInNewTab(true) / extraAttributes`. `StatColor` mirrors `TabBadgeColor`. `StatsOverview` extends `ServerDataElement`; `static override columns = n` (or `.columns(n)` instance setter) + `static override async getStats(ctx)` (or `.getStatsHandler(fn)`). `resolveServerData` serializes `Stat[]` → `{ stats: StatMeta[] }` so the renderer never touches the class. New `tagWidgetUrls(elements, urlBuilder)` helper stamps `meta.widgetUrl` per widget (panel-scope on dashboard, page-scope on custom pages). `WidgetDataProvider` + `useInitialWidgetData(id)` + `useWidgetData(meta)` (lazy mount-fetch + setInterval polling + visibility-pause + latest-wins seq). `SchemaRenderer` widened with `widgetData?` prop; auto-gen page stubs pass `vp._widgetData`. Renderer `case 'stats'` → grid of cards + inline-SVG sparkline (no chart-lib dep) + skeleton + url-wrap. |
| 7. `@pilotiq/recharts` adapter package | ✅ DONE 2026-05-03 cont'd | New workspace package mirroring `packages/codemirror/`. Exports `Chart` element + `ChartRenderer` + `registerChartRenderer()` boot helper. Core gets a `widgetRegistry` (parallel to `registry.ts`'s field-renderer registry) — `registerWidgetRenderer(type, Component) / getWidgetRenderer(type)` exported from `@pilotiq/pilotiq/react`. SchemaRenderer's default case dispatches every `meta.serverData === true` element through the widget registry; missing-renderer paints an inline "install `@pilotiq/recharts` and call `registerChartRenderer()` at app boot" error pointing the consumer at the fix. recharts is a peer dep — opt-in install. |
| 8. `Chart` element surface | ✅ DONE 2026-05-03 cont'd | `Chart.make(id).label(text).type(t).color(c).maxHeight(px).options(raw).filters({key:label}).defaultFilter(key).poll(s).getData(fn)` plus subclass-form statics (`static type/label/color/maxHeight/options/filters/defaultFilter/getData`). 8-type whitelist `line/bar/pie/doughnut/radar/polar/scatter/bubble` enforced at `.type()` call (throws on unknown). v1 ships `LineChart / BarChart / PieChart` (with doughnut via `innerRadius`) renderers; the four others surface a "type not yet supported" panel. Data shape `{ labels: string[], datasets: Array<{ label, data: number[], color? }> }` (Chart.js-shaped); renderer normalizes to Recharts row-shape via `__label`-keyed rows. Per-chart filter dropdown re-fetches with `{ filter }`; `Chart.resolveServerData(ctx)` falls back to `defaultFilter` when `ctx.filter` is unset. |
| 9. `Table` widget element | ✅ DONE 2026-05-03 cont'd | Exported as **`TableWidget`** (the schema-element `Table` keeps that name for the Resource list page; same-name collision avoided). Subclass form `class Recent extends TableWidget { static label, model, viewAllUrl, columns(), query(q), records(ctx) }`; fluent form `TableWidget.make('id').label().model(M).query(fn).columns([...]).viewAllUrl()`. `resolveServerData(ctx)` falls through `instance records → static records → instance model+query → static model+query → throw "no rows source"`; default query hook is `q => q.paginate(1, 5)`. Per-row server-side `formatStateUsing` runs in the resolver and stamps `row._formatted[col]` (parity with full Table). Columns are emitted **inline** under `meta.columns` (not as `meta.children`) so the resolver doesn't double-walk them. New `'tableWidget'` branch in SchemaRenderer mounts `TableWidgetRenderer` — slim `<table>` paint with skeleton + error banner + optional "View all →" header link. Renderer reuses `useWidgetData(meta)` for the lazy-fetch + polling lifecycle. Walker boundary added in `pageData.collectServerDataElements` (parallel to `form/repeater/builder/table`). |
| 10. `Resource.headerSchema() / footerSchema()` | ✅ DONE 2026-05-03 cont'd | New `Resource.headerSchema(ctx?) / footerSchema(ctx?)` statics; default `[]`. `ListPage.schema` is now async and slots `headerSchema` between `getHeader()` and `ListTabs+Table`, `footerSchema` after the Table. `resourceIndexData` calls `tagWidgetUrls(elements, id => \`${indexUrl}/_widget/${id}\`)` + `resolveServerDataElements(elements, ctx)` and stamps `_widgetData` into the response — same wire shape as `dashboardData / customPageData`. New `WidgetScope` variant `{ kind: 'resource'; slug }` + matching branch in `widgetData()`; `POST {base}/{slug}/_widget/:id` route runs `R.canAccess + R.canViewAny` in front of the widget visibility check. |
| 11. `Page.schema()` widget passthrough | ✅ DONE 2026-05-03 cont'd | Already-in-place: `resolveSchema` stamps `serverData/id/poll/lazy` on every `ServerDataElement` regardless of nesting; `collectServerDataElements / tagWidgetUrls / findWidgetById` walk into `Group/Card/Section/Split` containers. Tests added for nested-widget resolution under `Group` and `Card`. |
| 12. Tests | ✅ DONE 2026-05-03 cont'd | Tests written alongside phases A-E rather than as a standalone phase. 1608 tests at end of Phase E (target was ~+75-90, actual +138 across all five phases). Coverage: Server-data resolution + ordering; lazy skeleton wire; polling endpoint contract + filter pass-through; canView gate; Stat fluent surface (url/extraAttributes/descriptionIcon); StatsOverview render; Chart filter dropdown + type whitelist; TableWidget slim render; panel dashboard sugar; Resource header/footer schema. |
| 13. Playground demo | ✅ DONE 2026-05-03 cont'd | `playground-pilotiq/app/Pilotiq/widgets/`: `UsersStats` (3 KPI cards w/ sparkline), `PostsChart` (per-day line, today/week/month filter, 30s poll), `RecentPosts` (TableWidget on `Post`), `ActivityFeedView` (View escape hatch w/ `ActivityFeed` React component). Composed in `pages/MyDashboard.ts`; mounted via `panel.dashboard(MyDashboard)`. `+Layout.tsx` adds `registerChartRenderer()` + `registerWidgetComponents({ ActivityFeed })`. Verified end-to-end against Prisma. |
| 14. Docs | ✅ DONE 2026-05-03 cont'd | `docs/guide/widgets.md` (full reference incl. lazy/polling/auth/header-footer/custom-widgets), `docs/packages/recharts.md` (adapter package overview), `docs/guide/migrating-from-panels.md` "Widgets / dashboards (net-new)" section, README features list + `@pilotiq/recharts` packages-table row, `docs/plans/admin-gap-audit.md` Plan #15 tick (was Tier 3, now ✅), `packages/pilotiq/CLAUDE.md` widget elements + `Pilotiq.dashboard` + Resource header/footerSchema + `WidgetDataContext` notes. |
| 15. Core gap closed | ✅ DONE 2026-05-03 cont'd | `View` widgets had no built-in renderer pre-Phase-F (only the `widgets/registry.ts` they would consume). Added `react/widgets/ViewRenderer.tsx` + `case 'view'` branch in `SchemaRenderer.tsx`. Reuses `useWidgetData(meta)` for lazy + polling; falls back to inline error panels for missing component name / unregistered component / hook errors. |

**Tests at start:** 1470/1470. Build clean.
**After Phase A (2026-05-03):** 1523/1523 (+53). Build + typecheck clean.
**After Phase B (2026-05-03 cont'd):** 1559/1559 (+36). Build + typecheck clean.
**After Phase C (2026-05-03 cont'd):** 1563 in core (+4 widget-registry) + 22 in `@pilotiq/recharts` (Chart fluent / static / type-whitelist / resolveServerData / register). Build + typecheck clean for core + new package; pre-existing playground vite-type-dup warning is unrelated.
**After Phase D (2026-05-03 cont'd):** 1593 in core (+30 TableWidget — factory/identity, label/viewAllUrl, columns, toMeta, fluent records, subclass records, model+query, formatStateUsing per row). Build + typecheck clean.
**After Phase E (2026-05-03 cont'd):** 1608 in core (+15 — Resource.headerSchema/footerSchema defaults; ListPage slot order; async/SchemaContext threading; resourceIndexData _widgetData wiring + lazy null + widgetUrl stamping + nested-Group/Card resolution; widgetData resource-scope 404/found/footer/hidden/nested). Build + typecheck clean.
**After Phase F (2026-05-03 cont'd):** 1608 in core (Phase F is non-test work — playground demo, docs, ViewRenderer; verified end-to-end against Prisma at `/new-admin/`). All steps closed; Plan #15 fully complete.
**Target at completion:** ~1545-1560 (+75-90). **Actual at completion:** 1608 (+138 across phases A-E).

Estimated effort: **~2 weeks**. Phase A (steps 1-5) is the largest
chunk because it lays the wire-shape contract everything else
inherits; Phase C (steps 7-8) is medium because the adapter package
needs its own Vite/build wiring; phases B/D/E are small.

---

## Why we want it

Today pilotiq has two page primitives — Resource list/create/edit and
custom Page — and no story for "show me a few KPIs and a chart on the
homepage." Users hit this on day 1: a panel without a dashboard feels
incomplete next to Filament/Nova/Retool. The current escape hatch is
"write a custom Page subclass and render whatever you want," but that
puts every panel author on the hook for KPI card styling, polling
mechanics, sparkline rendering, and chart-lib choice — none of which
belong in user code.

Beyond the homepage, widgets pay off in two more spots:
- **Resource list pages** — show "5 newest posts" or "users this week"
  above the table without a separate dashboard click.
- **Custom pages** — same, on bespoke pages.

Filament is the design reference here (per
`feedback_filament_as_reference.md`). Filament v5's surface
(`Stat / StatsOverviewWidget / ChartWidget` and the `getStats /
getData / pollingInterval / isLazy / filtersSchema / columnSpan`
methods) maps naturally onto our existing schema/Element model.

---

## Decisions locked in

**Widgets are schema Elements, not a separate hierarchy.** Drops
`Widget` base class, `DashboardPage`, `widgets()`, `headerWidgets() /
footerWidgets()` from the API. `Stat`, `StatsOverview`, `Chart`,
`Table`, `View` extend `Element` directly. They inherit `columnSpan`,
`.visible()`, `Group / Fieldset / Split / Section` wrapping, and
authorization gating from Plans #8 and #10 for free.

**Chart library: Recharts** (same call shadcn made — declarative React
~80 KB, no imperative wrapper, doesn't lock consumers into our
abstraction).

**Adapter package: `@pilotiq/recharts`.** Mirrors the existing
`@pilotiq/tiptap` / `@pilotiq/codemirror` precedent. Lean core, opt-in
install, future `@pilotiq/chartjs` or `@pilotiq/echarts` swap exists
without core churn. Boot guard throws if `Chart` ships without
`registerChartRenderer()` (parallel to the codemirror gate).

**Dashboard discovery: opt-in.** `panel.dashboard(MyPage)` marks an
existing Page subclass as the panel-root entry. No
auto-mount-something-at-`/`.

**Lazy-loading default: on.** Server-data elements paint a skeleton on
first render and fetch their data via the same polling endpoint. User
can opt out per-element via `.lazy(false)`. Matches Filament v5's
`$isLazy = true` default.

**Polling format: seconds (number).** `Stat.poll(30)` not Filament's
string `'30s'`. Cleaner type-wise; documented.

**Breakpoint columns: int-only for v1.** `Group.columns(3)` and
`Element.columnSpan(2)`. Filament's responsive
`columns([md => 2, xl => 4])` array form deferred — same posture as
Repeater `grid()`.

---

## API

### Dashboard

```ts
// app/Pilotiq/Dashboard.ts
import { Page, Heading, Group, Card, Alert } from '@pilotiq/pilotiq'
import { UsersStats } from './widgets/UsersStats.js'
import { PostsChart } from './widgets/PostsChart.js'
import { RecentPosts } from './widgets/RecentPosts.js'

export class MyDashboard extends Page {
  static slug  = ''
  static label = 'Dashboard'
  static icon  = 'layout-dashboard'

  static schema() {
    return [
      Heading.make('Overview').description('Last 30 days'),

      Group.make().columns(3).schema([
        UsersStats.make(),
        PostsChart.make().columnSpan(2),
      ]),

      Card.make('Recent activity').schema([
        RecentPosts.make(),
        Alert.make('5 drafts pending review')
          .warning()
          .visible(ctx => ctx.draftCount > 0),
      ]),
    ]
  }

  static canView(user) { return user.isAdmin }
}
```

```ts
// AdminPanel.ts
panel
  .resources([...])
  .pages([MyDashboard, OtherPages])
  .dashboard(MyDashboard)        // sugar: marks this Page as the homepage
```

### Stat + StatsOverview

```ts
// app/Pilotiq/widgets/UsersStats.ts
import { StatsOverview, Stat } from '@pilotiq/pilotiq'
import { User, Session, Order } from '#models'

export class UsersStats extends StatsOverview {
  static columnSpan = 3
  static lazy       = true       // default; explicit for clarity

  static async getStats(ctx) {
    return [
      Stat.make('Users')
        .value(await User.query().count())
        .description('+12% this month')
        .descriptionIcon('trending-up', 'before')
        .icon('users')
        .color('success')
        .url('/admin/users'),

      Stat.make('Active sessions')
        .value(await Session.query().active().count())
        .description('right now')
        .icon('activity')
        .chart([12, 4, 8, 15, 22, 18, 30]),  // sparkline (inline SVG)

      Stat.make('Revenue (MTD)')
        .value('$' + (await Order.query().monthToDate().sum('amount')))
        .icon('dollar-sign')
        .color('primary')
        .url('/admin/orders').openUrlInNewTab(),
    ]
  }
}
```

`Stat` is a fluent value object (no rendering of its own).
`StatsOverview` is an Element subclass that returns an array of Stats
from `getStats(ctx)`.

**Stat fluent surface** (Filament v5 parity):
- `.value(v)` — main number / string
- `.description(t)` / `.descriptionIcon(name, position?)` — supplementary line
- `.icon(name)` — main stat icon
- `.color(name)` — uses pilotiq's color tokens (`primary / success / warning / danger / info`)
- `.chart([n, n, ...])` — sparkline data
- `.url(href)` / `.openUrlInNewTab(bool=true)` — clickable card
- `.extraAttributes({...})` — pass-through HTML attrs

### Chart

```ts
// app/Pilotiq/widgets/PostsChart.ts
import { Chart } from '@pilotiq/recharts'
import { Post } from '#models'

export class PostsChart extends Chart {
  static label   = 'Posts per day'
  static type    = 'line'
  static lazy    = true
  static poll    = 30                              // seconds
  static color   = 'primary'
  static maxHeight = 320

  static filters = {                               // simple per-chart filter dropdown
    today: 'Today',
    week:  'Last 7 days',
    month: 'Last 30 days',
  }
  static defaultFilter = 'week'

  static async getData(ctx) {
    const days = ctx.filter === 'today' ? 1
              : ctx.filter === 'month' ? 30
              : 7

    const rows = await Post.query()
      .selectRaw('DATE(createdAt) as day, COUNT(*) as count')
      .where('createdAt', '>', new Date(Date.now() - days * 86_400_000))
      .groupBy('day')
      .orderBy('day', 'asc')

    return {
      labels: rows.map(r => r.day),
      datasets: [{ label: 'Posts', data: rows.map(r => r.count) }],
    }
  }

  // Escape hatch: raw props passed through to the underlying Recharts component
  static options = { strokeWidth: 2, dot: false }
}
```

`@pilotiq/recharts` is installed and registered separately:

```bash
pnpm add @pilotiq/recharts
```

```ts
// AdminPanel.ts (or providers.ts)
import { registerChartRenderer } from '@pilotiq/recharts'
registerChartRenderer()
```

**Chart types (8):** `line / bar / pie / doughnut / radar / polar /
scatter / bubble`. v1 ships renderers for `line / bar / pie / doughnut`;
remainder follow as Recharts component mappings land. Boot throws if
`type` is not a known type.

### Table widget

```ts
// app/Pilotiq/widgets/RecentPosts.ts
import { Table } from '@pilotiq/pilotiq'
import { Post } from '#models'
import { TextColumn } from '@pilotiq/pilotiq/columns'

export class RecentPosts extends Table {
  static label    = 'Recent posts'
  static columnSpan = 1

  static query(q)  { return q.limit(5).orderBy('createdAt', 'desc') }
  static model    = Post
  static viewAllUrl = '/admin/posts'

  static columns() {
    return [
      TextColumn.make('title').limit(40),
      TextColumn.make('createdAt').date(),
    ]
  }
}
```

Slim mode reuses `TableRenderer` with no filters / no bulk / no
pagination, plus an optional "View all" link.

### View widget (escape hatch)

```ts
import { View } from '@pilotiq/pilotiq'
import { CalendarHeatmap } from '#widgets/CalendarHeatmap.js'

export class ContributionMap extends View {
  static columnSpan = 3
  static component  = CalendarHeatmap        // any React component

  static async getData(ctx) {
    return { days: await Activity.query().last(365).countByDay() }
  }
}
```

Component receives `{ data }` resolved from `getData`. The component
reference is stamped onto the same `_components.ts` manifest the
icon system uses (per `project_pilotiq_icon_system.md`).

### Resource header / footer schema

```ts
export class PostResource extends Resource {
  static model = Post

  static headerSchema() {
    return [
      Group.make().columns(2).schema([
        PostsThisWeek.make(),
        DraftCount.make(),
      ]),
      Alert.make('Editorial calendar locked through Friday').info(),
    ]
  }

  static footerSchema() {
    return [LongestRunningPostsTable.make()]
  }
}
```

Same hooks on `Page` already exist via `schema()`; no new API there.

### Resource list page above-the-table

```ts
// resources/Posts/PostResource.ts
static headerSchema() {
  return [PostsThisWeek.make(), DraftCount.make()]
}
```

Renderer: `headerSchema` array → grid above the list table; bulk
actions / filters strip / table render unchanged below.

---

## Wire shape

```ts
// Element-level additions on every server-data element:
type ServerDataElementMeta = ElementMeta & {
  serverData?:  true               // sentinel — renderer knows to expect _widgetData[id]
  poll?:        number             // seconds; absent = no polling
  lazy?:        boolean            // default true
  filters?:     Record<string, string>
  defaultFilter?: string
}

// Resolved data — keyed by element id
type ServerDataMap = Record<string, unknown>

// PageData additions (universal — covers Page schema + Resource headerSchema/footerSchema):
type PageDataWithWidgets = {
  ...
  _widgetData: ServerDataMap     // single map covers all widget elements regardless of slot
}
```

Server flow:
1. `pageData.ts` builds the page's element tree (existing).
2. New pass `resolveServerDataElements(elements, ctx)` walks the tree,
   collects every element with `serverData: true`, runs `getData /
   getStats` in parallel, stamps results into `_widgetData[id]`.
3. For `lazy: true` elements, the server STAMPS `_widgetData[id] =
   undefined` and skips the hook — client fetches via polling endpoint
   on mount.

Client flow:
1. `WidgetRenderer` (new dispatcher inside `SchemaRenderer`) reads
   `meta.serverData === true` → mounts the widget-specific renderer.
2. If `meta.lazy && data === undefined` → render skeleton, fire one-shot
   fetch to polling endpoint, swap data in.
3. If `meta.poll` → setInterval the fetch.
4. Filter dropdown changes → re-fetch with `{ filter: value }`.

---

## Polling route

`POST {base}/_widget/:id`

- Reads `:id` (Element id).
- Walks the active page's resolved schema to find the matching element
  (re-running the page-data builder server-side — keeps auth checks
  intact).
- Re-runs `Element.evaluateVisibility(ctx)` — 403 fail-closed.
- Re-runs `getData(ctx)` / `getStats(ctx)` with `ctx.filter` from body.
- Returns `{ data: ..., timestamp: number }`.

`_widget` is a panel-scope reserved underscore-prefixed token (parallel
to `_reorder / _search / _uploads`). Resource-scoped widgets use
`POST {base}/{slug}/_widget/:id` so the resource's `canAccess` runs in
front of the element's visibility check.

---

## Authorization

Every widget element inherits `Element.visible(rule)` from Plan #8
schema-layouts. No new `canView` predicate.

- Server-side: `evaluateVisibility(ctx)` runs during
  `resolveServerDataElements`; failing widgets are dropped from the
  rendered schema entirely (renderer doesn't see them).
- Polling endpoint: re-runs the same predicate; 403 on fail.

`Page.canView(user)` (Plan #10) gates the page itself.

---

## Renderer

Widget rendering folds into the existing `SchemaRenderer` dispatcher.
A new `widgetElement.tsx` module exports renderers per widget type; the
dispatcher picks them up by `type`:
- `'stats'` → `<StatsOverviewRenderer stats={data} columns={meta.columns} />`
- `'chart'` → `<ChartRenderer ... />` (resolved via the registry; throws
  with install pointer if `registerChartRenderer` was never called)
- `'table'` → reuses `TableRenderer` with `slim={true}`
- `'view'` → `<{component} data={data} />` resolved from `_components.ts`

Lazy-load skeletons live in `widgetElement.tsx` (one-per-type — stats
strip, chart rectangle, table-rows). Skeleton dimensions follow
`columnSpan` and `maxHeight` so the layout doesn't shift on data
arrival.

---

## Phasing (suggested commit boundaries)

1. **Phase A — server-data Element contract + plumbing (steps 1-5).**
   Ship the wire shape: server-data hook on Element,
   `resolveServerDataElements`, lazy-loading, polling route, `View`
   element as smoke test, `panel.dashboard()` sugar. Largest commit;
   touches pageData + Element + new route + renderer dispatcher.

2. **Phase B — Stat + StatsOverview (step 6).** Tier-1 demo
   primitive: KPI cards. Inline SVG sparkline.

3. **Phase C — `@pilotiq/recharts` adapter (steps 7-8).** New
   workspace package. ChartWidget surface, registerChartRenderer
   posture, 4-of-8 chart types as v1 renderers.

4. **Phase D — Table widget (step 9).** Slim mode of TableRenderer.

5. **Phase E — Resource header/footer + Page schema integration
   (steps 10-11).**

6. **Phase F — tests + playground demo + docs (steps 12-14).**

Each phase is independently committable + shippable; each leaves the
playground demo at a clean intermediate state.

---

## Open / deferred

- **Page-level filter form** (Filament's `HasFiltersForm` /
  `HasFiltersAction` / `persistsFiltersInSession`) — substantial,
  needs server-side session persistence. v1 workaround: drop a
  `Form.live()` element at the top of `Page.schema()`; widgets read
  upstream filter state via `$get`. Open a follow-up if a consumer
  hits the session-persistence case.
- **Responsive `columns([md => 2, xl => 4])`** — int-only for v1;
  open if a consumer hits the breakpoint case (mirrors Repeater
  `grid()` posture).
- **Widget caching layer** (`Element.cache(ttl)`) — slow `getData`
  blocks page render. v1: panel author wraps in their own cache
  (`@rudderjs/cache`). Add only if it becomes a recurring pattern.
- **Drag-to-rearrange dashboards** — Filament has it. Defer; reorder
  primitives ship as needed.
- **Per-user dashboard customization** (saved layouts, hide/show
  widgets) — big surface; deferred to a later plan.
- **Other chart libs** — `@pilotiq/chartjs`, `@pilotiq/echarts`. Same
  posture as the editor adapters: ship if a consumer asks.
- **`window.filamentChartJsPlugins` equivalent** — N/A; Recharts is
  composed component-by-component, users drop down to raw Recharts
  components when they need this.
- **Remaining 4 chart types** (radar / polar / scatter / bubble) —
  v1 ships line / bar / pie / doughnut renderers; the four others
  follow as Recharts mappings land. Type whitelist enumerates all 8
  from the start so user-side typings don't shift.
