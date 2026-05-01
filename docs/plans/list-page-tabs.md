# List-page tabs

Plan #7 from `admin-gap-audit.md`. Adds Filament-style query-shortcut tabs above
the table on resource list pages — "All / Drafts / Published / Archived"-style
strips, each tab narrowing the table query and optionally showing a count badge.

Estimated effort: ~1 day. Layers on top of the existing `Tabs` primitive,
`ListPage` base class, and `loadTableRecords` pipeline.

**Status: shipped 2026-05-01; polish 2026-05-03.** v1 lives in `Tab.ts` /
`elements/ListTabs.ts` per the implementation map below. Two follow-ups
landed in the polish pass: walkers (`findActiveTab`, `findListTabs`,
`resolveActiveTab` child filter) switched from `instanceof` to structural
`getType()` checks for Vite SSR module-cache safety; `buildTabUrl` now
emits the canonical paramless URL for the default tab (no `?tab=name`
when the tab is the default).

## Why we want it

The "primary axis" of most resource lists is a status enum (draft/published,
open/closed, active/archived). Filter dropdowns work but bury the most-used
slice inside a popover. Tabs surface that axis as a one-click strip and pair
naturally with a small per-tab count.

Tabs and filters compose — tabs are the primary axis, filters are secondary
refinements within the active tab.

## Naming

The form-side `Tab` (under `Tabs.make().tabs([Tab.make('Profile')…])`) is
already exported. The new class is **`ListTab`** so both can coexist without
shadowing each other. Container element is **`ListTabs`** (lives under
`src/elements/ListTabs.ts` next to Table/Form).

## API

```ts
class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }

  static override getTabs() {
    return [
      ListTab.make('all').label('All'),
      ListTab.make('drafts')
        .label('Drafts')
        .badge(() => prisma().article.count({ where: { status: 'draft' } }))
        .badgeColor('warning')
        .modifyQuery(q => q.where('status', 'draft')),
      ListTab.make('published')
        .label('Published')
        .icon('check-circle')
        .badge(() => prisma().article.count({ where: { status: 'published' } }))
        .modifyQuery(q => q.where('status', 'published')),
      ListTab.make('archived')
        .label('Archived')
        .icon('archive')
        .modifyQuery(q => q.where('status', 'archived')),
    ]
  }
}
```

### Builder surface

| Method | Effect |
|---|---|
| `.label(s)` | Display label. Defaults to capitalized name. |
| `.icon(s)` | Optional lucide icon to the left of the label. |
| `.badge(s \| fn)` | Static string or a server-side counter (`() => Promise<string \| number \| undefined>`). |
| `.badgeColor(c)` | One of `'default' \| 'primary' \| 'success' \| 'warning' \| 'destructive' \| 'info'`. |
| `.default()` | Mark as default when `?tab=` is absent. First tab is the default if none is marked. |
| `.modifyQuery(fn)` | `(query: ModelQuery) => ModelQuery` — same shape as `Filter.query()`. |
| `.modifyContext(fn)` | `(ctx: TableContext) => TableContext` — escape hatch for user-defined `Table.records()` handlers that don't use the model adapter. |

`modifyQuery` is the typed/declarative path used by the model adapter.
`modifyContext` is the escape hatch for custom records handlers (rare).

## Behavior

- **URL persistence:** active tab carried as `?tab=name`. Compatible with
  existing `?search=…&sort=…&page=…&<filterName>=…` params.
- **Tab switch:** SPA-navigates via `useNavigate()` (same pattern as filter
  changes). Resets `page` to 1; preserves search/sort/filters.
- **Default tab:** `Tab.default()` wins; otherwise first tab in the list.
- **Badges:** evaluated in parallel server-side via `Promise.all`. Errors
  swallow silently — failed badge omits the count rather than blowing up the
  page.
- **Composition with filters:** tab's `modifyQuery` runs *before* filter
  `where` clauses are applied. Both compose into the same ORM query.
- **`Resource.model` integration:** tab `modifyQuery` plugs into
  `modelTableRecords` next to `Filter.query()` — no separate code path.

## Implementation

1. **`src/Tab.ts`** — `ListTab` class. Builder fields, `toMeta()` emitting
   `{ type: 'listTab', name, label, icon?, badge?, badgeColor?, active, url }`.
   Render-time setters `withActive(b)` / `withResolvedBadge(s)` populated by
   the framework before serialization.
2. **`src/elements/ListTabs.ts`** — container Element. Holds `ListTab[]` as
   children. Emits `{ type: 'listTabs', children: [...] }`. Lives between
   `Heading` and `Table` in `ListPage.schema()`.
3. **`ListPage.getTabs()`** — new static hook returning `ListTab[]`. Default
   `[]`. When non-empty, `ListPage.schema()` wraps in `ListTabs.make()` and
   prepends to the schema.
4. **`pageData.resourceIndexData`** — read `?tab=` from query, resolve to a
   tab by name (falling back to default/first). Run `tab.modifyQuery(q)` via
   integration into `modelTableRecords` (new `tableTab` parameter on
   `TableContext`). Run `tab.modifyContext(ctx)` for tabs that supplied one.
   Resolve all badges in parallel via `Promise.all` and stamp via
   `withResolvedBadge`. Stamp `withActive` on the matching tab. Bake the
   per-tab URL using `currentPath + ?tab=name` (preserves other params).
5. **`modelTableRecords`** — accept `ctx.tabQuery` as an optional final
   `(q: ModelQuery) => ModelQuery` chain applied alongside filter queries.
6. **`SchemaRenderer.tsx`** — render `listTabs` as a horizontal trigger row
   using the existing `Tabs`-style chrome. Each trigger is an `<a href>` so
   right-click → "open in new tab" works; plain click is intercepted for SPA
   navigation. Badge renders as a small pill next to the label, with color
   from `badgeColor`. Active tab carries `data-active`.
7. **Tests** (added incrementally to existing files where possible):
   - `Tab.test.ts` — builder + meta round-trip.
   - `dispatchTable.test.ts` (or new `pageData.test.ts` cases) — query
     modifier composes with filters; badge eval in parallel; default-tab
     fallback; URL persistence.
   - Smoke test in `routes.test.ts` — full GET → tab strip in viewProps.
8. **Playground demo** — `ListArticles.getTabs()` with All / Drafts /
   Published / Archived (badges via `prisma().article.count()`).
9. **Docs** — section in `migrating-from-panels.md` plus CLAUDE.md updates
   on `defaultPages.ts` and `pageData.ts`.

## Out of scope (for v1)

- Per-tab override of header actions / row actions / columns. Filament
  supports `tab->columns(...)`; we'll punt until someone needs it.
- Lazy badge eval / SSR-streamed counts. Badges block page load on the
  slowest count query — fine for a few tabs, may become a knob later
  (`.badgeCache(seconds)`).
- Pinned-by-default + saved filters. Different feature.

## Risks / non-obvious

- **N+1 counts.** Each badge runs its own count query. Most cases are 3–5
  tabs which is acceptable, but a 10-tab table would be 10 parallel queries
  on every page render. Address only if it bites — `Promise.all` already
  parallelizes.
- **Tab name collision with the form-side `Tab`.** Resolved by separate
  class names (`Tab` form-side, `ListTab` list-side). Documented in CLAUDE.md.
- **Composition with `Table.recordUrl`.** Both stamp per-row state; no
  conflict — tabs operate on the query, not the row.
- **SPA-nav refresh.** Switching tabs needs to re-fetch records (same as
  filter change). Already supported via `useNavigate()` SPA round-trip.
