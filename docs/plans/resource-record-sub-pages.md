# Plan: custom record sub-pages auto-registered on `RelationTabs`

**Surfaced by:** open-core audit (admin-gap-audit) — "custom Resource pages auto-register sub-nav tab (needs `ResourcePages` widening)."

**Goal.** Let a Resource declare extra pages that live under a single record (not under the resource list) and surface them as tabs in the sub-nav strip next to View / Edit / managers. Each sub-page receives the loaded record in its schema and runs its own `canAccess(user, record)` gate.

```ts
class UserResource extends Resource {
  static override pages() {
    return {
      record: {
        activity: ActivityPage,
        profile:  ProfilePage,
      },
    }
  }
}
```

Result: tabs become `[View, Edit, Activity, Profile, …managers]` on every record of that resource. URLs are `${base}/${slug}/:id/${subPageSlug}`.

---

## Scope (v1 — ship; v2 — defer)

**Ship:**
- `ResourcePages.record?: Record<string, typeof Page>` widening on the existing `pages()` shape. The four standard roles (`index / create / edit / view`) keep their strongly-typed slots.
- `PageMode` union widened with `'record'`; a Page bound to a record sub-page returns `'record'` from `getMode()` for breadcrumb / page-title use.
- `Page.canAccess(user, record?)` signature widened — second optional arg, defaults to undefined for non-record contexts so existing custom-page subclasses don't break.
- Routes: `GET ${resourceBase}/${slug}/:id/:subPageSlug` per registered record sub-page. Same prelude as the resource-view / -edit pages: `R.canAccess + R.canView(user, record) + SubPage.canAccess(user, record)`.
- New page-data builder `resourceRecordPageData(pilotiq, slug, recordId, subPageSlug, req)` mirrors `resourceViewData`'s shape but resolves the user's schema from the sub-page class.
- `RelationTabs` strip: insert a tab per registered record sub-page between `__edit` and managers. Gate each on `SubPage.canAccess(user, record)`. Active when the sub-page slug matches `activeKey`.
- Boot validation:
  - Slug pattern `[A-Za-z0-9_-]+` (rejects empty / whitespace / slashes / reserved characters).
  - No collision with reserved relation-manager tokens (`edit`, `delete`, `restore`, `force-delete`, `_form`, `_action`, `_search`, `_uploads`, `_attach`, `_detach`, `_bulk-detach`).
  - No collision with relation-manager `relationship` slugs on the same resource (sub-page wins over the manager? — no, **boot fails loudly** so the conflict surfaces in dev).
  - No collision with literal `'edit'` / `'create'` segments the resource uses for its own routes.

**Defer (no consumer ask yet):**
- Per-record sub-pages declared from a `RelationManager` (depth-2 record sub-pages). Out of scope; the sub-pages live on the parent Resource only in v1.
- `getMode() = 'record'` rendering polish (custom page-title prefix, etc.) — relies on whatever the user's schema emits.
- Per-tab badges on the sub-nav strip — `RelationTabs` doesn't support badges today; not blocking, add when asked.
- Sidebar/sub-nav nesting (a sub-page appearing in the panel sidebar nested under the resource) — sub-pages are per-record by design, sidebar surfaces would imply panel-level which they aren't.
- Mode = `'record'` discriminating across multiple sub-pages — every sub-page returns the same `'record'` mode; the active sub-page slug carries the discriminator separately.

---

## Wire shape

```ts
// ResourcePages, augmented:
export interface ResourcePages {
  index?:  typeof Page
  create?: typeof Page
  edit?:   typeof Page
  view?:   typeof Page
  /** Record-scoped custom sub-pages. Each entry is a `Page` subclass
   * mounted at `${resourceBase}/${slug}/:id/${subPageSlug}`. Tabs show
   * in the `RelationTabs` strip between `__edit` and managers. */
  record?: Record<string, typeof Page>
}

// PageMode, augmented:
export type PageMode = 'list' | 'create' | 'edit' | 'view' | 'record' | 'custom'

// Page.canAccess, widened:
static async canAccess(_user: unknown, _record?: unknown): Promise<boolean> { return true }
```

`RelationTabs` wire shape unchanged — record sub-page tabs use the same `{ key, label, url, active, icon? }` envelope as `__view` / `__edit` / managers. `key` is the registered sub-page slug.

---

## Server flow

**`Resource`** (`packages/pilotiq/src/Resource.ts`):
- Type widening on `ResourcePages`.
- `resolvePages()` continues to overlay user `pages()` over defaults; the new `record` map is preserved verbatim.
- Add `static getRecordPages(): Record<string, typeof Page>` accessor (sugar over `resolvePages().record ?? {}`) to keep call sites concise.

**`Page`** (`packages/pilotiq/src/Page.ts`):
- `PageMode` union adds `'record'`.
- `canAccess(user, record?)` signature widened — existing subclasses keep working (extra arg is optional).
- No new base class. Users extend `Page` directly; pilotiq sets `getMode() = 'record'` via a per-resource synthesis (the resource registers the page class as a record sub-page; the framework knows the mode by registration, not by class).
  - Alternative: introduce `RecordPage extends Page` with `static override getMode() { return 'record' }` as a convenience. Defer to v2 unless a consumer asks — the synthesis path keeps user code thin.

**Boot validation** (`packages/pilotiq/src/Pilotiq.ts` / wherever resources are validated):
- For each resource, iterate `R.getRecordPages()`:
  - Slug pattern check.
  - Collision check against `R.relations().map(M => M.getRelationship())`.
  - Collision check against reserved tokens.
  - Collision check against `'edit'` / `'create'` (resource's own literal segments).
- Boot throws on first violation with a clear message pointing at the resource + offending slug.

**Routes** (`packages/pilotiq/src/routes.ts`):
- After registering each resource's view / edit / delete / relation-manager routes, iterate the `getRecordPages()` map and register:
  ```ts
  router.get(`${resourceBase}/:id/${subPageSlug}`, async (req, res) => {
    const user = await pilotiq.resolveUser(req)
    if (!await policyAccess(R, user)) return forbidden(res, json)
    // canAccess + canView gated inside resourceRecordPageData; route just dispatches.
    const data = await resourceRecordPageData(pilotiq, slug, req.params.id, subPageSlug, req)
    if (!data) { res.status(404); return ... }
    return view('pilotiq.slug', data)
  })
  ```

**Data builder** (`packages/pilotiq/src/pageData.ts`):
- New `resourceRecordPageData(pilotiq, slug, recordId, subPageSlug, req)`. Mirrors `resourceViewData` closely:
  1. Look up `R = cfg.resources.find(r => r.getSlug() === slug)`. Return `null` on miss.
  2. Look up `SubPage = R.getRecordPages()[subPageSlug]`. Return `null` on miss.
  3. Resolve user, run `R.canAccess(user) + R.canView(user, record)` after loading the record. 403 on any fail.
  4. Run `SubPage.canAccess(user, record)`. 403 on fail.
  5. Build ctx with `record`, call `SubPage.schema(ctx)`, resolve, prepend `buildRelationTabs(R, recordId, base, subPageSlug, user, record)`, prepend breadcrumbs.
  6. Return `{ pageType: 'record-page', panel, resource, parent: { id, title }, basePath, layout, schemaData, notifications, subPage: { slug, label, icon } }`.

**`buildRelationTabs`** (already widened with `user` + `parentRecord` in the per-tab-gating change):
- Insert tabs for `R.getRecordPages()` between the `__edit` tab and the managers.
- Each tab's `activeKey` test compares to the registered sub-page slug.
- Gate via `await SubPage.canAccess(user, parentRecord)`. Same `safeBool` shim.
- Tabs with throwing predicates fail closed (consistent with `__view` / `__edit` / managers).

**Vike dispatch** (`packages/pilotiq/src/pageData.ts → dispatchPageData`):
- The Vike `/pages/(pilotiq)/relation-list` stub matches all 4-segment URLs (`${slug}/:id/:relationship`). On the server, `relationManagerData({kind: 'relation-list', ...})` currently returns `null` when no relation manager named `relationship` exists. Extend the dispatch:
  - First try the relation manager.
  - If not found, look up `R.getRecordPages()[relationship]` — if a record sub-page exists, dispatch via `resourceRecordPageData`.
  - Otherwise return `null` (existing 404 path).
- Server-side viewProps carries `pageType: 'relation-list' | 'record-page'`; renderer reads `schemaData` uniformly via `<SchemaRenderer>` regardless.

**No new Vike route stub** — record sub-pages share the relation-list route. This keeps the route count constant and matches the "single route for ambiguous URLs" pattern already used elsewhere in the codebase.

---

## Client flow

**Renderer:** no changes. `<SchemaRenderer>` already renders any `schemaData` uniformly; `RelationTabs` already paints whatever tabs the server stamps.

**SPA navigation:** Vike's `relation-list` route function matches the same 4-segment URL shape; `dispatchPageData` chooses relation-vs-record on the server.

---

## Tests

**`Resource.test.ts` / `Page.test.ts`:**
- `ResourcePages.record` round-trips through `resolvePages()`.
- `Page.canAccess(user, record?)` accepts an optional record arg.
- Boot validation: slug pattern, reserved-token collision, manager-slug collision.

**`relationManagerData.test.ts` / new `resourceRecordPageData.test.ts`:**
- Record sub-page route returns 404 when slug isn't registered.
- Returns 403 when `R.canView` fails.
- Returns 403 when `SubPage.canAccess(user, record)` fails.
- Returns the schema when all gates pass; the tabs strip includes the sub-page tab with `active: true`.
- Multiple sub-pages render as sibling tabs between `__edit` and managers.

**`relationManagerData.test.ts` (RelationTabs tests):**
- Record sub-page tab shows when registered + gates pass.
- Record sub-page tab hidden when `SubPage.canAccess` returns false (parity with the per-tab gating shape).
- Throwing `canAccess` fails closed.
- Strip omits sub-page when no `parentRecord` resolved (parity with `__view` / `__edit`).

**`dispatchPageData` test:**
- 4-segment URL with a known record sub-page slug routes through `resourceRecordPageData`.
- 4-segment URL with a known relation slug still routes through `relationManagerData` (unchanged).
- 4-segment URL with neither returns `null`.

---

## Files touched

**Modified:**
- `packages/pilotiq/src/Resource.ts` — `ResourcePages` widening + `getRecordPages()` accessor.
- `packages/pilotiq/src/Page.ts` — `PageMode` + `canAccess(user, record?)`.
- `packages/pilotiq/src/Pilotiq.ts` (or wherever resource registration validates) — boot validation for record-page slugs.
- `packages/pilotiq/src/routes.ts` — per-sub-page route registration.
- `packages/pilotiq/src/pageData.ts` — new `resourceRecordPageData` + `RelationTabs` insertion + `dispatchPageData` fallthrough.

**New tests:**
- `packages/pilotiq/src/resourceRecordPageData.test.ts` (or extend `relationManagerData.test.ts`).

**Docs:**
- `packages/pilotiq/CLAUDE.md` — add a paragraph under Resource describing the `record` map shape + auto-tab insertion.
- New `docs/guide/record-sub-pages.md` — user-facing guide.

**Changeset:** `resource-record-sub-pages.md` — minor (additive, opt-in).

---

## v1 limits (documented)

- One depth only. Sub-pages live under a Resource's record; nested sub-pages (a sub-page under a relation manager's record) are not supported in v1.
- No automatic sidebar surface. Sub-pages don't appear in the panel sidebar — they're per-record. Panel-level pages (`Pilotiq.pages([…])`) remain the way to declare top-level entries.
- No automatic page-title prefix. The sub-page's schema is rendered as-is; users add their own heading.
- Record sub-page slugs collide with relation-manager slugs → boot error (loud failure, dev-friendly).
- The `canAccess(user, record?)` signature widening is backward-compatible — existing custom-page `canAccess(user)` overrides keep working since the second arg is optional and ignored.

---

## Open questions

- **Should record sub-pages support cluster prefixes?** Resources can sit under a cluster (`R.cluster = MyCluster`), in which case URLs are `${base}/${cluster.slug}/${slug}/:id/:subPageSlug`. The plan implicitly inherits this via `resourceBasePath(...)`; no extra work needed.
- **Should `Page.canAccess(user, record?)` distinguish missing-record from no-record?** v1 treats both as `record = undefined`. If a record-aware `canAccess` is called without a record (e.g. while building nav metadata), it sees `undefined`. The Resource-side predicates use the same convention.

---

## Out of scope

- A `RecordPage` base class (defer until users hit ergonomic friction with raw `Page`).
- Mode-specific rendering polish.
- Tab badges on record sub-pages.
- Sub-page sidebar surfaces.
- Per-cluster overrides for sub-page routing.
