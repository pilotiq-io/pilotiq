---
name: Global Search
description: Plan #12 — Cmd+K palette with per-resource search, opt-in registration, debounced fetch, server-side query through `Resource.model` + `Column.searchable()` (with overrides for title/subtitle/url)
type: plan
---

# Global Search

Plan #12 from `admin-gap-audit.md`. Adds a Cmd+K command palette that
searches across every resource in the panel and routes the user to the
matching record. Mature admin frameworks ship this as a baseline
expectation — once a panel has more than two resources, finding a
record by typing its title beats clicking through nav + list + filter.

This plan reuses the building blocks already shipped:
`Resource.recordTitleAttribute` (Plan #9 — record title), the
`ModelLike / ModelQuery` contract (`@pilotiq/pilotiq/orm`), and
`Column.searchable()` (already drives the table search bar). It adds
one new server endpoint, three opt-in resource statics for overrides,
and one client-side palette component.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `Resource.globalSearch` opt-in toggle + `globallySearchableAttributes()` defaults to `Column.searchable()` columns | ⏳ NOT STARTED | Default `false` — quiet resources don't pollute results until the user opts them in |
| 2. `Resource.getGlobalSearchResultTitle / Subtitle / Url(record)` overrides | ⏳ NOT STARTED | Defaults: title from `recordTitleAttribute`, subtitle empty, url from `${base}/${slug}/${id}` |
| 3. `searchAllResources(pilotiq, query, user, opts?)` server helper | ⏳ NOT STARTED | Walks `cfg.resources`, filters by `canAccess + canViewAny`, runs each resource's search query in parallel |
| 4. `GET ${base}/_search?q=…&limit=…` route | ⏳ NOT STARTED | Returns `{ ok, results: [{ resource, id, title, subtitle?, url, icon? }] }`; 403 when `canAccess` fails on the panel level |
| 5. `searchData(pilotiq, query, req)` page-data builder | ⏳ NOT STARTED | Wraps `searchAllResources` with `pilotiq.resolveUser(req)`; mirrors the formStateData/formWizardData pattern |
| 6. `<CommandPalette>` client component + Cmd+K listener in AppShell | ⏳ NOT STARTED | Hand-rolled on the existing Dialog primitive (no new `cmdk` dep yet); debounced fetch (~150ms), keyboard nav (↑/↓/Enter/Esc), result grouping by resource |
| 7. Search-button trigger in Sidebar/Topbar headers | ⏳ NOT STARTED | Compact pill showing "Search… ⌘K"; opens the palette on click + on Cmd+K from anywhere |
| 8. Tests | ⏳ NOT STARTED | Server: searchAllResources runs in parallel, drops resources where canAccess/canViewAny fails, surfaces title/subtitle/url overrides correctly. Client: debounce, in-flight cancellation, result rendering |
| 9. Playground demo + opt-in on existing resources | ⏳ NOT STARTED | Mark `ArticleResource` searchable, add a few rows, verify Cmd+K finds them |

**Tests at start:** 731/731. Build clean.
**Target at completion:** ~770 (+40).

Estimated effort: **~1 week** (matches the audit estimate). Steps 1-5
are mechanical; step 6 (the palette) is the long pole.

**Prereqs:**
- Plan #9 navigation ✅ DONE — `Resource.recordTitleAttribute` is the
  default title source. The icon system (Plan #8.5) renders per-result
  icons from `Resource.icon`.
- Plan #10 authorization ✅ DONE — every result is gated through
  `R.canAccess(user)` AND `R.canViewAny(user)` so users can't discover
  records they can't list.
- ORM auto-wiring — `Resource.model` provides the structural
  `ModelQuery` we run searches through. Resources without a model can
  still opt in by overriding `getGlobalSearchQuery(query)`.

**Companion memories:**
- `feedback_pilotiq_panel_module_client_safe.md` — the palette
  component reads from `panel.navigation` for grouping; it cannot
  import server-only helpers.
- `project_pilotiq_navigation.md` — global search reuses
  `Resource.recordTitleAttribute` (no second source of truth) and
  surfaces results under the same icons.

## Why we want it

Three concrete frictions today, all on the playground:

1. **Editing an article by name.** Today: sidebar → "Articles" → table
   load → search box → debounce → click. ~6 clicks. Cmd+K → type 3
   chars → Enter. ~1 click.
2. **Cross-resource jumps.** Sidebar nav has Articles, Categories,
   Users, Site Settings, theme. Finding the article *whose author is
   Alice* needs scanning Authors first then jumping. Cmd+K with
   "Alice" surfaces Alice plus her articles in a single result list.
3. **Discoverability for new users.** A panel with 8+ resources is
   intimidating. Cmd+K is the universal admin escape hatch — type the
   thing you want to find, hit Enter.

Beyond the user-facing wins, global search composes naturally with
features we've already shipped:

- **Authorization (#10).** Results filter through `canAccess +
  canViewAny`, so admin-only resources don't leak titles to viewers.
- **Icons (#8.5).** Per-result icons come straight from
  `Resource.icon`; no new icon registration.
- **Reactive fields (#5)** unblocked: a `live()` SelectField that
  searches a related resource will share the same backend later.

## API

### Resource opt-in

```ts
class ArticleResource extends Resource {
  static slug                 = 'articles'
  static recordTitleAttribute = 'title'
  static icon                 = 'newspaper'

  // Plan #12 — opt this resource into global search results.
  static globalSearch = true

  // Optional override: which columns to LIKE-match against.
  // Default: every `Column.searchable()` column on the resource's
  // table (already set up for in-table search) plus `recordTitleAttribute`.
  static override globallySearchableAttributes(): string[] {
    return ['title', 'excerpt', 'authorName']
  }

  // Optional override: derive the result row's title.
  // Default: record[recordTitleAttribute] ?? record.name ?? record.title ?? record.id.
  static override getGlobalSearchResultTitle(record: unknown): string {
    return `${(record as Article).title} (#${(record as Article).id})`
  }

  // Optional override: subtitle line under the title in the palette.
  // Default: empty (no subtitle row).
  static override getGlobalSearchResultSubtitle(record: unknown): string | undefined {
    const a = record as Article
    return a.publishedAt ? `Published ${a.publishedAt}` : 'Draft'
  }

  // Optional override: URL the palette navigates to when the user
  // hits Enter. Default: `${base}/${slug}/${id}` (the View page when
  // available, the Edit page otherwise).
  static override getGlobalSearchResultUrl(record: unknown, base: string): string {
    return `${base}/articles/${(record as Article).id}/edit`
  }

  // Optional override: build the search query yourself. Useful when
  // you need joins (e.g. searching by `category.name`) or non-LIKE
  // matchers. Default uses `model.query()` plus LIKE on each
  // attribute.
  static override getGlobalSearchQuery(needle: string): ModelQuery | undefined {
    return undefined
  }
}
```

### Method reference

| Surface | Signature | Default | Notes |
|---|---|---|---|
| `Resource.globalSearch` | `static globalSearch: boolean` | `false` | Opt-in. `false` excludes the resource entirely. |
| `Resource.globallySearchableAttributes()` | `() => string[]` | `[recordTitleAttribute, ...searchableColumns]` deduped | Column names to LIKE-match. Empty array → never matches (effectively opted-out even when `globalSearch=true`). |
| `Resource.getGlobalSearchResultTitle(record)` | `(record) => string` | record[recordTitleAttribute] ?? name ?? title ?? id | The big text in each row of the palette. |
| `Resource.getGlobalSearchResultSubtitle(record)` | `(record) => string \| undefined` | undefined | Smaller line below; renderer skips when undefined. |
| `Resource.getGlobalSearchResultUrl(record, base)` | `(record, base) => string` | `${base}/${slug}/${id}` | Where Enter navigates. |
| `Resource.getGlobalSearchQuery(needle)` | `(needle: string) => ModelQuery \| undefined` | undefined → default LIKE chain | Override for joined / fulltext / non-LIKE cases. Returning a `ModelQuery` skips the default builder; returning `undefined` falls through. |

### Server endpoint

```
GET ${base}/_search?q=alice&limit=10
```

Response:

```json
{
  "ok": true,
  "results": [
    {
      "resource": "articles",
      "resourceLabel": "Articles",
      "icon": "newspaper",
      "id": "42",
      "title": "Alice's first post",
      "subtitle": "Published 2026-04-12",
      "url": "/admin/articles/42"
    },
    ...
  ]
}
```

Failure cases:
- `q` empty / shorter than 2 chars → 200 with `results: []` (cheap
  early-out). Never errors on a typing user.
- `canAccess(user)` fails on every resource → 200 with `results: []`
  (don't 403 — the palette stays open and just shows "no results").
- `canAccess(user)` for a *specific* resource fails → that resource is
  silently dropped from the search.
- `Resource.getGlobalSearchQuery` throws → log + drop that resource's
  results; continue with the rest in parallel.

### `searchAllResources` helper

```ts
// src/search.ts
export interface GlobalSearchResult {
  resource:      string
  resourceLabel: string
  icon?:         SerializedIcon
  id:            string
  title:         string
  subtitle?:     string
  url:           string
}

export interface GlobalSearchOptions {
  /** Cap results PER RESOURCE before merge. Default 5. */
  limitPerResource?: number
  /** Cap total results returned. Default 25. */
  limitTotal?: number
}

export async function searchAllResources(
  pilotiq: Pilotiq,
  query:   string,
  user:    unknown,
  opts?:   GlobalSearchOptions,
): Promise<GlobalSearchResult[]>
```

Implementation outline:

1. Trim + lower-case query. If empty or `.length < 2`, return `[]`.
2. Filter `cfg.resources` to those with `globalSearch === true`.
3. Run `R.canAccess(user)` + `R.canViewAny(user)` in parallel; drop
   failures.
4. For each surviving resource, build a `ModelQuery`:
   - If `R.getGlobalSearchQuery(needle)` returns a query, use it.
   - Else build the default: `model.query()` chained with
     `.where(col, 'LIKE', '%${needle}%')` for the first attribute,
     then `.orWhere` for the rest.
5. `.paginate(1, limitPerResource)` to cap each resource's
   contribution. Use the same `paginate` we use for table records —
   no new ORM contract method needed.
6. Map each row through `getGlobalSearchResultTitle / Subtitle / Url`
   and `serializeIcon(R.icon, R.name)`.
7. `Promise.all` the resources → flatten → slice to `limitTotal`.

The merge order is registration order so users have a predictable
"Articles before Categories" grouping. We don't try to score across
resources — each resource gets up to `limitPerResource`, and the
palette groups visually by resource so cross-resource ranking
doesn't matter.

### `searchData` page-data builder

```ts
// pageData.ts
export async function searchData(
  pilotiq: Pilotiq,
  query:   string,
  req:     unknown,
): Promise<{ ok: true; results: GlobalSearchResult[] }> {
  const user = await pilotiq.resolveUser(req)
  const results = await searchAllResources(pilotiq, query, user)
  return { ok: true, results }
}
```

Same shape as `formStateData / formWizardData`. The route handler
calls it; the data builder returns JSON; no Vike `+data` hook
because the palette is purely client-driven (Cmd+K isn't a route).

### Route

```ts
// routes.ts
router.get(`${base}/_search`, async (req, res) => {
  const user = await pilotiq.resolveUser(req)
  // Panel-level guard: if Pilotiq.guard() denies, the search route is
  // also denied. Resource-level filtering happens inside searchData.
  const q     = String((req.query?.['q']     ?? '')).slice(0, 200)
  const limit = Math.min(50, Math.max(1, Number(req.query?.['limit'] ?? 25)))
  const data  = await searchData(pilotiq, q, req)
  return res.json(data)
})
```

No `_action` / `_form` style POST — pure GET so it caches well in the
browser. The query is bounded (200 char cap) to defend against silly
inputs; the per-request limit is bounded too.

### Client palette

```tsx
// react/CommandPalette.tsx
export function CommandPalette({ basePath, navigation }: {
  basePath:   string
  navigation: NavItem[]
}): React.ReactElement
```

Behavior:
- Mounts in `AppShell` (next to `ToasterProvider`).
- Listens for `Cmd+K` / `Ctrl+K` globally (via `document.addEventListener('keydown', …)`).
- Opens a `Dialog` (existing primitive in `react/ui/dialog.tsx`).
- Input → debounce 150ms → fetch `${basePath}/_search?q=…&limit=25`.
- Result list grouped by resource; each row has icon + title +
  subtitle. Keyboard: ↑/↓ moves selection, Enter navigates,
  Esc closes.
- In-flight cancellation: each fetch supersedes the prior. Same
  `requestSeqRef + latestSeenRef` pattern as Plan #5's
  `FormStateContext`.
- Empty input → show recently-used resources or panel navigation
  shortcuts (default to navigation entries — Cmd+K becomes a faster
  nav). v1 is just "navigation entries when empty"; recent records
  is a v2 polish.
- Single-button trigger pill in the sidebar/topbar header showing
  `Search… ⌘K`; clicking the pill opens the same dialog.

Icon resolution: each `GlobalSearchResult.icon` is already a
`SerializedIcon` (string registry key or `{ class: 'X' }` manifest
ref), so the palette uses the same `useIconFor()` hook the nav uses.

## Backwards compatibility

Purely additive. `Resource.globalSearch` defaults to `false`, so
existing panels show no results until users opt in. The new endpoint
is on a fresh URL prefix (`_search`); no existing route conflicts.

`Resource.recordTitleAttribute` is already shipped from Plan #9; this
plan just consumes it.

## What about searching globals / pages?

Out of scope for v1. Globals are singletons (no records to find), and
custom Pages don't have a record model. We could surface custom Pages
as static "go to Settings" entries — that overlaps with the
"navigation entries when empty input" affordance, so it stays out of
the result schema for now. Add later if users ask.

## Failure modes

| Scenario | UI response | Notes |
|---|---|---|
| Server 500 | Toast `"Search failed"`; palette stays open | Same toast helper as form-submit |
| Empty query | No fetch issued; palette shows nav entries (or recent records in v2) | Cheap early-out |
| Rapid typing | Earlier responses dropped via in-flight id | Mirrors Plan #5 pattern |
| Resource throws on getGlobalSearchQuery | That resource silently drops; others succeed | Logged server-side |
| `R.model` is undefined and no `getGlobalSearchQuery` override | Resource skipped | We don't ship a fallback in-memory walker — it'd be misleading to load every record into memory just to LIKE-match. |
| User authenticates after open | Palette uses the user from the route prelude on each fetch | No mid-session caching |
| Result URL conflicts with current page | Vike SPA-nav handles same-URL gracefully | No special-casing |
| Network down | Toast `"Search failed"`; retry on next keystroke | Same posture as Plan #5 |
| Cmd+K hit while Dialog is open elsewhere | Browser default may ring the bell; we still trap and toggle our palette | Document key conflict guidance |

## Out of scope

- **Recent records / history** — palette starts empty when input is
  empty; v1 shows nav entries instead. Recent records needs a
  per-user store that doesn't exist yet.
- **Fuzzy matching** — v1 is straight LIKE. If a user wants
  Levenshtein or trigram, they override `getGlobalSearchQuery` (e.g.
  Postgres `pg_trgm`). Standardising fuzzy on every backend isn't
  feasible.
- **Cross-record join previews** — "the article whose author is
  Alice" surfaces both Alice and her articles, but doesn't preview
  the join inline. The palette shows them as separate result groups.
- **`@pilotiq/media` global search** — needs the media migration off
  panels first (same gating as FileUpload's media adapter).
- **Full-text indexing** — Meilisearch / Elasticsearch / Typesense
  integration. Same posture as fuzzy: override
  `getGlobalSearchQuery` to call the index, return whatever
  `ModelQuery`-shaped wrapper your store provides. Out of the box
  v1 is just LIKE.
- **`globalSearchKeyBindings` per-resource keyboard shortcuts**
  (Filament has these). Polish — Cmd+K covers the 95% case.
- **Inline action triggers from the palette** — "type 'delete article
  42' to delete it" — out of scope. Cmd+K is for navigation in v1.
- **Saved searches / pinned queries** — UX axis orthogonal to the
  primitive. Defer.

## Test plan

| Area | Tests |
|---|---|
| `Resource.globalSearch` defaults to false | new tests on Resource.test.ts |
| `globallySearchableAttributes()` defaults | dedupes recordTitleAttribute + searchable columns; honors override |
| `getGlobalSearchResultTitle` | uses recordTitleAttribute → name → title → id fallback chain |
| `getGlobalSearchResultUrl` | defaults to `${base}/${slug}/${id}`; override wins |
| `searchAllResources` | runs resources in parallel; respects canAccess + canViewAny; returns flat array; honors limit caps |
| `searchAllResources` failure | one resource throws → others still resolve; logged warn |
| `searchAllResources` opt-out | resource without `globalSearch=true` is skipped |
| `searchData` policy prelude | wraps with `pilotiq.resolveUser(req)` |
| Route `/_search` | 200 on valid; empty array on too-short query; query-param sanitisation |
| `<CommandPalette>` (vitest + jsdom) | opens on Cmd+K; debounce cancels in-flight; ↑/↓/Enter keys; closes on Esc; renders icon + title + subtitle |

Target: ~40 new tests, bringing the suite to ~770. (We're at 731 from
Plan #8.)

## Rollout

1. Add `Resource.globalSearch` + `globallySearchableAttributes()` +
   `getGlobalSearchResultTitle / Subtitle / Url` defaults. Each is a
   static method with a sensible default; subclass overrides win.
2. `getGlobalSearchQuery(needle)` optional override. Default
   undefined → caller builds a `ModelQuery` from
   `globallySearchableAttributes()`.
3. `searchAllResources(pilotiq, query, user, opts?)` in
   `src/search.ts`. Walks resources, runs queries in parallel, maps
   to `GlobalSearchResult[]`. Includes the policy prelude.
4. `searchData(pilotiq, query, req)` in `pageData.ts`. Wraps
   `searchAllResources` with `pilotiq.resolveUser(req)` for symmetry
   with other data builders.
5. `GET ${base}/_search` in `routes.ts`. Sanitises query, calls
   `searchData`, returns JSON.
6. `<CommandPalette>` in `react/CommandPalette.tsx` —
   Dialog-based, hand-rolled (no `cmdk` dep). Debounced fetch with
   in-flight cancellation. Keyboard nav.
7. Mount the palette in `AppShell`. Add the "Search… ⌘K" pill to
   `SidebarLayout` and `TopbarLayout` headers. Global keydown
   listener for Cmd+K.
8. Playground: opt `ArticleResource` in (`globalSearch = true`).
   Type a few articles, verify Cmd+K finds them; verify icon renders;
   verify Enter navigates correctly.
9. Update `CLAUDE.md` Resource line + memory notes.

Steps 1-5 are server-only and independently testable. Step 6 is
client-only and works against any URL that returns the expected JSON
shape — even a hand-rolled fixture during development.

**Single-PR-vs-split decision.** Server (1-5) and client (6-7) are
each useful on their own — the server endpoint can be hit by
external tooling without the palette UI, and the palette UI gracefully
shows "no results" when the server returns empty. But shipping them
in one PR is simpler than feature-flagging the half-built state, and
the playground demo (8) needs both. Bundle them.

The exception is fancy-search backends (Meilisearch, Postgres FTS,
trigram). Those override `getGlobalSearchQuery` and ship as
follow-ups; v1 is just LIKE.
