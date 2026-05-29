# Pilotiq documentation

Start here. Two kinds of docs:

- **Guides** — task-oriented how-tos for a specific feature.
- **Reference** — the full API surface for each building block.

New to Pilotiq? Read **[Getting started](./getting-started.md)** first — it gets a
panel rendering at `/admin` in a few steps. Then skim [Resources](./packages/pilotiq/resources.md)
and [Schema elements](./packages/pilotiq/schema.md) for the mental model.

---

## Reference

The API for each building block.

**Core**

- [Resources](./packages/pilotiq/resources.md) — the CRUD unit; `model`, pages, nav metadata, authorization.
- [Pages](./packages/pilotiq/pages.md) — list/create/edit/view roles and custom pages.
- [Globals](./packages/pilotiq/globals.md) — singleton resources (app settings).
- [Schema elements](./packages/pilotiq/schema.md) — the element tree forms, tables, and infolists are built from.
- [Layouts](./packages/pilotiq/layouts.md) — sidebar vs topbar chrome, branding, navigation.

**Forms**

- [Forms](./packages/pilotiq/forms.md) — the form element, lifecycle hooks, submission.
- [Fields](./packages/pilotiq/fields.md) — every field type and its fluent methods.
- [Validation](./packages/pilotiq/validation.md) — built-in rules, custom + cross-field validators.
- [Reactive forms](./packages/pilotiq/reactive.md) — `live()`, `afterStateUpdated`, dependent options.

**Tables**

- [Tables](./packages/pilotiq/tables.md) — the table element, sort/search/pagination, bulk actions.
- [Columns](./packages/pilotiq/columns.md) — every column type, formatters, summaries.
- [Filters](./packages/pilotiq/filters.md) — select, ternary, date-range, form, and query-builder filters.

**Actions & more**

- [Actions](./packages/pilotiq/actions.md) — CRUD/bulk/relation factories, modals, visibility gates.
- [Authorization](./packages/pilotiq/authorization.md) — the `canX` predicates and how they gate routes + UI.
- [Global search](./packages/pilotiq/global-search.md) — ⌘K palette and per-resource search config.
- [Import / export](./packages/pilotiq/import-export.md) — CSV/JSON round-trip.
- [Notifications](./packages/pilotiq/notifications.md) — toast + database-backed notifications.

---

## Guides

How-tos for a specific feature.

**Resources & navigation**

- [Clusters](./guide/clusters.md) — group resources under a URL prefix + nav entry.
- [Record sub-pages](./guide/record-sub-pages.md) — custom per-record pages with their own tab.
- [Relations](./guide/relations.md) — embed a related resource's table/form on the parent.
- [Soft deletes](./guide/soft-deletes.md) — trash + restore instead of hard delete.

**Tables & listing**

- [Card listing](./guide/card-listing.md) — swap the table for a responsive card grid.
- [Grouping](./guide/grouping.md) — band rows by a column, with optional drill-in.
- [Defer loading](./guide/defer-loading.md) — skeleton-first, async row fetch.
- [Filter persistence](./guide/filter-persistence.md) — remember the active filter set per resource.
- [Query builder](./guide/query-builder.md) — user-composed runtime filter rules.
- [Query-string identifier](./guide/query-string-identifier.md) — namespace URL state for multiple tables per page.

**Forms & display**

- [Repeater](./guide/repeater.md) — repeatable array-row fields.
- [Builder](./guide/builder.md) — heterogeneous block fields (pick a type per row).
- [Infolists](./guide/infolists.md) — read-only label/value detail layouts.
- [Widgets](./guide/widgets.md) — dashboard stats, charts, table widgets.

**Chrome & customization**

- [Render hooks](./guide/render-hooks.md) — inject UI at named chrome + page slots.
- [Component slots](./guide/component-slots.md) — replace nav/header/footer regions with your own components.
- [Right sidebar](./guide/right-sidebar.md) — a second sidebar for plugin panes (chat, outline, inspector).
- [User menu](./guide/user-menu.md) — the top-right identity dropdown.
- [Database notifications](./guide/database-notifications.md) — the bell dropdown + broadcast.
- [Extending Pilotiq](./guide/extending-pilotiq.md) — custom Field/Column/Entry/Widget primitives.

---

## Adapters

Opt-in packages that register field/widget types.

- [Tiptap](./packages/tiptap.md) — rich-text field (slash menu, draggable blocks, mentions).
- [CodeMirror](./packages/codemirror.md) — code-editor field with language registry and themes.
- [Recharts](./packages/recharts.md) — chart widgets (line, bar, pie, doughnut).

---

## Background

- [Architecture](../Architecture.md) — how the Vite plugin, provider, and view routes fit together.
- [Comparison vs other admin panels](./comparison.md).

> Design/history notes for shipped features live in [`docs/plans/`](./plans) — internal,
> not a user reference.
