---
name: pilotiq-widgets
description: Dashboard / page / resource widgets in pilotiq — Stat & StatsOverview KPI cards, TableWidget, and custom View components; their server-data lifecycle (lazy + poll) and panel / page / resource placement
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: building a dashboard or adding widgets — KPI stat cards (`StatsOverview` / `Stat`), a mini data table (`TableWidget`), a custom React widget (`View` + `registerWidgetComponents`), or placing any of them via `Pilotiq.dashboard()`, a custom Page `schema()`, or `Resource.headerSchema()` / `footerSchema()`
skip: full-page resource list tables (use `pilotiq-resource` / `pilotiq-fields`); chart widgets specifically (use the `@pilotiq/recharts` guidelines — `Chart` is a widget shipped by that adapter)
metadata:
  author: pilotiq
---

# Pilotiq Widgets

## When to use this skill

Load when you're:

- Building a **dashboard** (`Pilotiq.dashboard(MyDashboardPage)`) or adding widgets to a custom Page's `schema()`.
- Adding a **row of KPI cards** — `StatsOverview` with `Stat`s (value, description, delta icon, sparkline).
- Adding a **compact data table** widget — `TableWidget` (top-N rows + "view all" link).
- Embedding a **custom React component** as a widget — `View` + `registerWidgetComponents`.
- Mounting widgets **above / below a resource list** — `Resource.headerSchema()` / `footerSchema()`.

For a **chart**, that's the `@pilotiq/recharts` `Chart` element (same widget lifecycle; see its guidelines). For a resource's main list table, that's `pilotiq-resource`.

## Quick Reference

| Task | Open |
|---|---|
| KPI cards — `StatsOverview` (subclass or fluent) + `Stat.make(...)` value/description/icon/chart/url | `rules/stat-widgets.md` |
| Mini table (`TableWidget`) + custom component (`View` + `registerWidgetComponents`) | `rules/table-and-view-widgets.md` |
| Server-data lifecycle (`serverData` / `lazy` / `.poll()`), placement (panel / page / resource), endpoints, `useWidgetData` | `rules/lifecycle-and-placement.md` |

## Key concepts (load once)

- **Four core widget elements, one base.** `StatsOverview`, `TableWidget`, `View` all extend `ServerDataElement`; `Chart` (from `@pilotiq/recharts`) too. They resolve their data **server-side** and ship it to the client — never fetch in a component you write yourself.
- **Two authoring styles for each.** Subclass (`static` data hook) or fluent (`.make(id)` + `.get*Handler(fn)`). Both produce identical meta.
- **`lazy: true` by default + `.poll(seconds)`.** First paint reads the SSR-resolved slot; lazy widgets fetch after mount; `.poll(n)` re-fetches every `n` seconds (paused while the tab is hidden). You don't wire any of this — the framework's `useWidgetData` owns it.
- **Placement is just *where you put the element*.** In `Pilotiq.dashboard(P)`'s page schema (panel scope), a custom Page's `schema()` (page scope), or `Resource.headerSchema()` / `footerSchema()` (resource scope). Each scope has its own widget-data endpoint; you don't register routes.
- **`View` needs a registered component.** A `View` widget renders a React component you register via `registerWidgetComponents({ Name: Cmp })` from `@pilotiq/pilotiq/widgets` (a client-safe subpath). The element ships only the component *name* + resolved data over the wire.
- **Widgets are display-only and don't nest in arrays.** The widget-URL walker stops at `form` / `repeater` / `builder` / `table` containers — widgets-inside-rows are unsupported in v1.

## Examples

- `playground/app/Pilotiq/widgets/UsersStats.ts` — `StatsOverview` (KPI cards + sparkline).
- `playground/app/Pilotiq/widgets/RecentPosts.ts` — `TableWidget`.
- `playground/app/Pilotiq/widgets/ActivityFeedView.ts` + `ActivityFeed.tsx` — `View` + its registered component.
- `playground/app/Pilotiq/pages/MyDashboard.ts` + `AdminPanel.ts` — `Pilotiq.dashboard(MyDashboard)` wiring.
