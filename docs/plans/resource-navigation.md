---
name: Resource navigation
description: Plan #9 — navigationGroup / navigationSort / navigationLabel / navigationBadge / navigationParentItem / recordTitleAttribute
type: plan
---

# Resource navigation

Plan #9 from `admin-gap-audit.md`. Adds Filament-style navigation metadata to
`Resource` / `Global` / `Page` so the sidebar (and topbar) can group, sort,
relabel, badge, and nest items. Currently the sidebar is flat: resources
render in registration order, no grouping, no badges.

Estimated effort: ~1 day. Touches `Resource.ts` / `Global.ts` / `Page.ts`,
`pageData.panelInfo()`, `AppShell` types, and the two layout components.
No route changes, no data-flow changes.

**Prereq:** `docs/plans/icon-system.md` ✅ DONE (2026-04-30). The Vite
plugin component manifest is in place and `Resource.icon` already
accepts component refs — `navigationIcon` slots into the same
serialization + resolution pipeline (`serializeIcon` → `{class}` wire
shape → `useIconFor`).

## Why we want it

Once a panel grows past ~6 resources the flat list becomes unreadable.
Filament's nav metadata is the minimal surface that solves this: a label
override, a group name, an explicit sort key, a server-eval'd count badge,
and a parent reference for sub-nav. None of it is novel — it's plumbing
that every comparable framework ships, and it unblocks `Plan #12 global
search` (which needs `recordTitleAttribute`) and the eventual breadcrumb
work.

## API

All fields are static on `Resource`. `Global` and `Page` get the same set
(minus `recordTitleAttribute`, which only makes sense on Resource).

```ts
class ArticleResource extends Resource {
  static label         = 'Articles'
  static labelSingular = 'Article'
  static icon          = 'newspaper'
  static model         = Article

  // ── new in #9 ──
  static navigationGroup     = 'Content'
  static navigationSort      = 10
  static navigationLabel     = 'Posts'                      // overrides `label` in nav only
  static navigationBadge     = () => Article.where({ status: 'draft' }).count()
  static navigationBadgeColor = 'warning'
  static navigationParentItem = undefined                   // string name of parent nav item
  static recordTitleAttribute = 'title'                     // column used to render a record reference
}
```

### Field reference

| Field | Type | Default | Effect |
|---|---|---|---|
| `navigationGroup` | `string \| undefined` | `undefined` | Renders under a labelled group section. Items without a group land in an unnamed top section. |
| `navigationSort` | `number \| undefined` | `undefined` | Lower sorts first. Tie-break: registration order. Items without a sort go after sorted items. |
| `navigationLabel` | `string \| undefined` | `label` | Sidebar label override. `Resource.label` still drives page titles. |
| `navigationIcon` | `ComponentType \| string \| undefined` | `icon` | Sidebar icon override. Component reference (preferred) or registry string. See `icon-system.md`. |
| `navigationBadge` | `() => string \| number \| Promise<…> \| undefined` | `undefined` | Server-eval'd; rendered as a small pill next to the label. Errors swallow silently. |
| `navigationBadgeColor` | `'default'\|'primary'\|'success'\|'warning'\|'destructive'\|'info'` | `'default'` | Pill color. |
| `navigationParentItem` | `string \| undefined` | `undefined` | Name of another resource/page nav item. Item renders nested under the parent. |
| `recordTitleAttribute` | `string \| undefined` | `'name'` then `'title'` then `'id'` (resolved at usage site, not here) | Column to render when referring to a record (Plan #12 search results, breadcrumbs, future relation pickers). |

`navigationParentItem` references the **nav item name** — the resource
class's `Resource.name` (the JS class name) for resources/globals, or
`Page.slug` for pages. We pick class-name over slug because it's stable
across slug edits; documented as such. Same identifier scheme used by
the icon-system component manifest, so both plans share keys.

## Behavior

- **Group ordering.** Groups render in the order their first member
  resolves to. Override later if needed (`Pilotiq.navigationGroups([...])`
  is a Tier-2 follow-up; out of scope here).
- **Sort fallback.** Within a group: `navigationSort` ascending → ties
  fall back to registration order in `Pilotiq.resources([…])`. Items
  without a sort sit after sorted items in registration order.
- **Active state.** Layout determines active item by prefix-matching the
  current pathname against each nav item's URL. The longest matching
  prefix wins (so `/posts/new` activates `Posts` not the dashboard).
- **Badges run in parallel** server-side via `Promise.all` in
  `panelInfo()`. The aggregate adds one round-trip equal to the slowest
  badge — same pattern as `ListTab.badge`. Failed badges omit the count.
- **Sub-nav.** Children render indented under the parent, with the parent
  retaining its own click target. No accordion / collapse for v1 — flat
  visual nest only.
- **Globals & custom Pages** read the same fields. `Global` defaults to
  `navigationGroup: 'Settings'` if unset (matches Filament's habit and
  what most users want). Override with explicit `undefined` to opt out.

## Implementation

1. **`src/Resource.ts`** — add the seven static fields. Provide a
   `static getNavigationLabel()` / `getNavigationIcon()` helper that
   falls through to `label` / `icon`. `getNavigationIcon()` returns
   `ComponentType | string | undefined` — the layout uses the same
   `resolveIcon()` helper as `Resource.icon`. Keep
   `recordTitleAttribute` as plain field with the resolution helper
   living next to its usage site in Plan #12 (don't try to resolve
   here — `id` falls out of the model and we don't want a runtime
   ORM dep).
2. **`src/Global.ts` / `src/Page.ts`** — same fields minus
   `recordTitleAttribute`. `Global` defaults `navigationGroup` to
   `'Settings'`.
3. **`src/pageData.ts` `panelInfo()`** — re-shape the `resources` /
   `globals` / `pages` arrays into a single nav tree:
   ```ts
   navigation: Array<{
     name: string                  // class name or page slug — stable id
     label: string
     icon?: string                 // class name (component manifest) or registry string
     url: string
     group?: string
     sort?: number
     badge?: string                // resolved (string), pre-serialized
     badgeColor?: string
     children?: NavItem[]          // populated from navigationParentItem
   }>
   ```
   Build flat → resolve `navigationParentItem` references → nest →
   sort within each group → return. Resolve all `navigationBadge()`
   calls in parallel via `Promise.all` before serializing. Errors are
   swallowed (badge omitted) so a broken count never breaks page render.
   `icon` serializes as a string regardless of source: component-typed
   `Resource.navigationIcon = Foo` ships as `'ResourceClassName'`
   (looked up in the component manifest at render); string-typed ships
   as-is (looked up in the runtime registry).
4. **`src/react/AppShell.tsx`** — replace `resources` / `pages` /
   `globals` props on `panel` with a single `navigation: NavItem[]`
   pre-grouped. Drop the legacy three-array shape. (Free repo, free
   refactor.)
5. **`src/react/layouts/SidebarLayout.tsx`** — render one
   `<SidebarGroup>` per nav group, label via `<SidebarGroupLabel>`.
   Within a group, render items in pre-sorted order; nested children
   render indented under their parent. Active highlight via prefix
   match on `usePathname()` (or the SSR-passed `currentPath` —
   layouts already get one of these). Badge renders as a small pill
   to the right of the label using `badgeColor` from the shared
   color map (re-use `ListTab` color tokens).
6. **`src/react/layouts/TopbarLayout.tsx`** — top-level nav items
   render as flat trigger buttons. Items in a group: the group label
   becomes a dropdown trigger, children become menu items. Items
   without a group: bare trigger. Badges render inline next to the
   label. Sub-nav (parent/child) collapses into the same dropdown.
7. **Tests:**
   - `Resource.test.ts` — new fields default sanely; `getNavigationLabel`
     / `getNavigationIcon` fall through.
   - `pageData.test.ts` — `panelInfo()` groups + sorts + nests + resolves
     badges in parallel; failed badge swallows; `navigationParentItem`
     pointing at a non-existent name is silently ignored (item renders
     at top level).
   - `routes.test.ts` smoke — full GET → `panel.navigation` in viewProps.
8. **Playground demo** — split `playground-pilotiq` resources into
   groups: `Content` (Articles, Categories), `Users` (User), `Settings`
   (Global). One badge on Articles for draft count. Add a nested
   resource as a smoke test.
9. **Docs** — section in `migrating-from-panels.md` (panels has no
   equivalent — net-new feature). Update CLAUDE.md `Resource.ts`
   bullet with the seven new fields. Update `pageData.ts` bullet to
   note the navigation tree shape. Update `AppShell` / Sidebar /
   Topbar bullets to match the new prop shape.

## Out of scope (for v1)

- **`Pilotiq.navigationGroups([...])`** — explicit group ordering /
  collapse-by-default / group icons. Tier 2 once we hit a panel where
  the natural ordering goes wrong.
- **`Resource.canAccess` / nav-time auth filtering** — covered by
  Plan #10 (authorization). Until that lands, all nav items render
  regardless of viewer role. Wire-through is a one-line filter when
  Plan #10 ships.
- **Global search integration** — `recordTitleAttribute` lands here
  but isn't wired into a search UI until Plan #12.
- **Breadcrumb generation.** Sub-nav is a visual concern only for v1;
  breadcrumb walks come with the relations work.
- **Dynamic nav** (per-request mutation, A/B). The fields are static,
  evaluated at panel-config time; only `navigationBadge` is a function
  and that's per-request only because a count query has no other home.
- **Accordion collapse / persistent collapse state.** Groups are always
  expanded for v1.

## Risks / non-obvious

- **Static fields can't depend on request context.** `navigationGroup`
  / `navigationSort` / `navigationLabel` are evaluated once per panel
  config (cached). Only `navigationBadge` runs per request. If anyone
  needs request-aware labels later, we'll add a `getNavigationLabel(ctx)`
  static method overload — same pattern as `ListTab.badge`.
- **`navigationParentItem` cycles.** A points at B points at A. Detect
  during nest pass and break the cycle (item renders at top level with
  a console warning in dev). Cheap to detect; cheaper than letting the
  renderer recurse.
- **Badge perf.** Same shape as `ListTab.badge` — fine for ~10 items,
  potentially N+1 for huge panels. `Promise.all` parallelizes. If it
  bites, add `.navigationBadgeCache(seconds)` later. Don't pre-optimize.
- **Sidebar prop-shape break.** Current `panel.resources` / `panel.pages`
  arrays are public-ish (anyone consuming `viewProps.panel` directly).
  The free repo has zero external consumers; the pro repo grep is the
  bar — if pro reads these, update both in the same change. Per
  `feedback_check_pro_on_panels_changes.md`.
- **Class-name as nav id.** Minified bundlers can mangle class names.
  We're SSR-only here (panelInfo runs server-side, ships strings to
  client), so the JS class name is the post-`.name` string at panel
  config time on the server — stable. Document the gotcha so nobody
  later tries to look up the item by class name on the client. Same
  constraint applies to icon-system; document once, reference from
  both plans.
