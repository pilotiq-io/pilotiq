---
name: Clusters
description: Filament-style structural cluster — URL prefix + collapsing children behind a single sidebar entry. New `Cluster` abstract class; Resources / Globals / Pages opt in via `static cluster: typeof MyCluster`. Touches every URL builder + the Vite page generator.
type: plan
---

# Clusters

A **cluster** is a logical container that groups related Resources, Globals,
and custom Pages under a shared URL prefix and a single sidebar entry. It's
the Filament `Cluster` analogue.

Pilotiq today already has two grouping primitives:

- `static navigationGroup: string` — visual grouping in the sidebar
  (heading + items), no URL change.
- `static navigationParentItem: string` — nests one item under another
  in the sidebar, no URL change.

Neither gives URL prefixing or collapses children behind a single nav
entry. Clusters add both:

- URLs gain a cluster slug segment: `/admin/products/categories` instead
  of `/admin/categories`.
- The cluster appears as one entry in the main sidebar; clicking it
  deep-links to the first accessible child (or to a `landingPage` when
  the user supplies one).
- Children stay reachable in the sidebar — typically nested under the
  cluster entry — but the cluster is the navigable identity.

## Class shape

```ts
export abstract class Cluster {
  static slug?: string
  static label?: string
  static icon: IconValue = undefined

  // Mirrors Resource's nav metadata so clusters compose with
  // navigationGroup ('Settings' container that itself sits under a
  // 'System' heading, etc.).
  static navigationGroup:        string | undefined
  static navigationSort:         number | undefined
  static navigationLabel:        string | undefined
  static navigationIcon:         IconValue
  static navigationBadge?:       NavigationBadgeHandler
  static navigationBadgeColor:   NavigationBadgeColor
  static navigationParentItem:   string | undefined

  // Plan #10 — gates every child. canAccess(user) === false hides
  // the cluster + every child from nav AND blocks routes (403).
  static async canAccess(user: unknown): Promise<boolean> { return true }

  // Where the cluster nav entry deep-links to. Default: first
  // accessible child URL (resolved at panelInfo time).
  static landingPage?: typeof Page

  static getSlug(): string { /* defaults from class name kebab-case */ }
  static getNavigationLabel(): string
  static getNavigationIcon(): IconValue
}
```

Children opt in:

```ts
class CategoryResource extends Resource {
  static cluster: typeof Cluster | undefined = ProductsCluster
  // …
}
```

`cluster?: typeof Cluster` lands on `Resource`, `Global`, **and** `Page`
(custom pages can sit inside a cluster too). Symmetric.

## Builder

```ts
Pilotiq.make('admin').clusters([ProductsCluster, ContentCluster])
```

`PilotiqConfig.clusters: (typeof Cluster)[]` — registered like
resources / globals / pages. Required: every child whose `static cluster`
references a class must point at one in this list (boot throws
otherwise).

## URL resolution

Single helper, threaded everywhere:

```ts
function resourceBasePath(cfg: PilotiqConfig, R: typeof Resource): string {
  const C = R.cluster
  return C ? `${cfg.path}/${C.getSlug()}/${R.getSlug()}`
           : `${cfg.path}/${R.getSlug()}`
}
// + globalBasePath(cfg, G), pageBasePath(cfg, P)
```

Goal: NOT a single grep through `${base}/${slug}` left after this lands.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. Cluster class | ⏳ NOT STARTED | New file `src/Cluster.ts`; mirror Resource's nav metadata + canAccess; `getSlug()` + `getNavigationLabel()` + `getNavigationIcon()` defaults. |
| 2. PilotiqConfig + builder | ⏳ NOT STARTED | Add `clusters: typeof Cluster[]` to `PilotiqConfig`; `Pilotiq.clusters(c)` builder. Initialize to `[]` in the private constructor. |
| 3. Boot validation | ⏳ NOT STARTED | Duplicate cluster slugs throw; reserved-token check (`_search`, `_uploads`, `_widget`, `theme`, `api`, `''`); every child's `static cluster` must point at a registered cluster. |
| 4. Child class plumbing | ⏳ NOT STARTED | `static cluster?: typeof Cluster = undefined` on `Resource`, `Global`, `Page`. Accessor helper + types. |
| 5. URL helper | ⏳ NOT STARTED | `resourceBasePath(cfg, R) / globalBasePath(cfg, G) / pageBasePath(cfg, P)` exported from a new `src/clusterPaths.ts` (cycle-clean — does not import `Resource` etc., only types). |
| 6. routes.ts cluster prefix | ⏳ NOT STARTED | Replace every `${base}/${slug}` site with the helper. ~50 occurrences spanning resource list / create / view / edit / delete / restore / force-delete / `_action` / `_form/state` / `_form/wizard` / `_form/mentions` / `_reorder` / `_cell` / `_uploads` (panel-level — NOT cluster-prefixed). Globals + custom pages mirror. Relation routes nest one segment deeper. |
| 7. pageData.ts cluster prefix | ⏳ NOT STARTED | Every `tagFormStateUrls / tagFormWizardUrls / tagRichTextMentionUrls / tagActionDispatch / tagWidgetUrls / tagCellEditUrls / tagTableReorderUrls` URL builder threads the cluster prefix. `buildRelationTabs` URL string. `getGlobalSearchUrl(record, base)` default extends to consult the resource's cluster. |
| 8. PilotiqRegistry.findByPath | ⏳ NOT STARTED | When `parts[0]` matches a registered cluster slug, shift parts and resolve the second segment as the resource/global/page slug. Currently flat — needs cluster-aware lookup. |
| 9. Vite plugin page generation | ⏳ NOT STARTED | Auto-gen route functions detect cluster prefix. Two options: (a) widen every existing stub's route fn to handle both shapes via `partsAfterCluster(parts)` helper; (b) add a parallel set of `cluster-resource-list`, `cluster-resource-create`, `cluster-resource-view`, `cluster-resource-edit`, `cluster-relation-list/create/edit`, `cluster-slug` stubs. Lean toward (a) — fewer files, single source of truth, and the registry lookup already shifts on cluster match. The route fn checks `cfg.clusters[parts[0]]` via the registry to decide the offset. |
| 10. Sidebar — `panelInfo()` builds clusters as nav entities | ⏳ NOT STARTED | Each cluster becomes a `RawNavItem` whose `children` are its resources/globals/pages. Children inside a cluster set `parent` to the cluster's class name (mirrors `navigationParentItem`). Sort within the cluster by `navigationSort`. Cluster's own URL = first accessible child URL (or `landingPage` URL when set). Empty clusters (every child filtered out by `canAccess`) drop entirely. |
| 11. Authorization gating | ⏳ NOT STARTED | `Cluster.canAccess(user)` runs alongside child `canAccess` in `buildNavigation`'s parallel block. False short-circuits the entire cluster + every child. Route layer: `routes.ts` policy prelude consults the resource's cluster (added to `checkPolicy` calls). Throwing → fail closed. |
| 12. Tests | ⏳ NOT STARTED | ~30 new tests. Cluster boot validation (5: dup slug, reserved token, dangling reference, missing cluster, valid). URL prefix on each route shape (8). panelInfo cluster nesting (4: empty cluster drops, sort within, parent shadowing, badge resolution). canAccess fall-through (3: cluster fails → child hidden, child fails → child hidden but cluster shows others, both fail closed). Vite route function offsets (4). Global search URL with cluster (2). PilotiqRegistry findByPath (4). |
| 13. Playground demo | ⏳ NOT STARTED | `playground-pilotiq` — pick a `ContentCluster` containing `Articles` + `Posts` + `Categories` (currently top-level resources). New `app/Pilotiq/Content/ContentCluster.ts`. Wire into `AdminPanel.ts` via `.clusters([ContentCluster])`. URLs flip to `/admin/content/articles`, `/admin/content/posts`, `/admin/content/categories`. Verify list/create/edit/view/delete + relations + global search + CommandPalette. |
| 14. Docs | ⏳ NOT STARTED | New `docs/guide/clusters.md` (concept + setup + URL changes + auth interplay + landingPage). README features bullet. `packages/pilotiq/CLAUDE.md` Architecture + Key Files entries. Memory: `project_pilotiq_clusters.md`. |

**Tests at start:** 2176/2176. **Target at completion:** ~2206 (+30).

**Estimated effort:** ~1.5–2 days. Most of the bulk is the URL-builder
sweep — every site exists today, and the helper turns each into a 1-line
mechanical edit. The Vite plugin route-fn offset is the only place
where there's actual logic to write.

## Out of scope (deferred)

- **Cluster dashboard / index page** — the cluster's URL just deep-links
  to its first accessible child. Filament has a default cluster page
  listing children; pilotiq leans on `landingPage` (a regular Page)
  when a user wants a dedicated landing surface, and otherwise skips
  the layer.
- **Nested clusters** — clusters inside clusters. Not blocked by this
  plan (the URL helper would just chain), but defer until a consumer
  asks. v1 cluster trees are flat.
- **Cluster-internal sidebar** (Filament's "when inside a cluster, show
  cluster's items in the sidebar instead of the panel-wide nav") — v1
  keeps the same panel sidebar everywhere; cluster children nest under
  their cluster entry. Cluster-internal sidebar is a separate UX
  decision; revisit after dogfooding.
- **Cluster `navigationBadge` aggregation** — the cluster's own badge
  doesn't sum its children's badges; it's an independent handler the
  user wires.
- **Cluster `canAccess` wrapping per-child** — the design treats them
  as AND'd: cluster gates the entire group; each child still runs its
  own `canAccess` after. We do NOT auto-derive child predicates from
  cluster predicates.

## Open design choices (will resolve during impl)

1. **Resource → Cluster reference shape.** `static cluster: typeof Cluster`
   (class ref, parallel to `navigationParentItem` resolving by name).
   Class ref wins for type-safety + IDE jump; the boot validation
   doesn't need to fall back to string lookup.
2. **Where does the cluster nav entry deep-link?** Lean toward **first
   accessible child URL**. The user can override via `static landingPage:
   typeof Page` (a Page that's also in `cfg.pages` and inside the
   cluster) — a cluster homepage. Filament's Cluster has a default
   index page that lists child resources; we skip that layer in v1
   because it's chrome that doesn't pay for itself.
3. **Empty clusters.** When every child fails `canAccess`, drop the
   cluster from nav entirely (don't render an empty parent). Mirrors
   how `navigationParentItem` handles missing parents — silent drop.
4. **Reserved cluster slugs.** Same set as resources: `_search`,
   `_uploads`, `_widget`, `theme`, `api`, `''`. A cluster slug colliding
   with a top-level resource slug throws at boot (the resource would
   be unreachable — `${base}/${slug}` would resolve to the cluster
   first under the new findByPath).
5. **Page generation strategy (option a vs b in Step 9).** Lean toward
   **(a) — widen route functions**. Adds one helper `partsAfterCluster`
   to every generated stub; reuses the existing dispatch surface. (b)
   doubles the stub count permanently and forces the registry / route
   handlers to know which "shape" matched. (a) keeps the registry as
   the single source of truth for cluster-vs-not.

## Files to touch

- `packages/pilotiq/src/Cluster.ts` — new abstract class.
- `packages/pilotiq/src/Pilotiq.ts` — `PilotiqConfig.clusters` + `.clusters([…])`.
- `packages/pilotiq/src/PilotiqServiceProvider.ts` — pass clusters through.
- `packages/pilotiq/src/PilotiqRegistry.ts` — `findByPath` cluster-aware.
- `packages/pilotiq/src/Resource.ts` / `Global.ts` / `Page.ts` — `static cluster?: typeof Cluster`.
- `packages/pilotiq/src/clusterPaths.ts` — new helper module (avoids cycle).
- `packages/pilotiq/src/routes.ts` — cluster-prefix every URL builder; widen policy prelude with cluster `canAccess`; boot validation.
- `packages/pilotiq/src/pageData.ts` — every `tag*Urls` builder; `panelInfo()` cluster nesting; `getGlobalSearchUrl` default.
- `packages/pilotiq/src/search.ts` — search result URL builder cluster-aware.
- `packages/pilotiq/src/schema/RelationTabs.ts` — `buildRelationTabs(R, recordId, base, …)` widens to `(R, recordId, cfg, …)` (it needs to know R's cluster) OR caller hands in the resource-base-path.
- `packages/pilotiq/src/vite.ts` — page generation route functions handle cluster prefix.
- `packages/pilotiq/src/Cluster.test.ts` (new) + `routes-clusters.test.ts` (new) + extensions to `pageData.test.ts`, `Resource.test.ts`, `authorization.test.ts`.
- `playground-pilotiq/app/Pilotiq/Content/ContentCluster.ts` (new) + `playground-pilotiq/app/Pilotiq/AdminPanel.ts`.
- `docs/guide/clusters.md` (new) + `packages/pilotiq/CLAUDE.md` + `README.md`.

## Risks

- **URL-builder sweep miss.** A single missed site → one broken page.
  Mitigation: post-edit grep for `${base}/${slug}` and `${cfg.path}/${`
  patterns; flag any literal that isn't using the helper.
- **Vike auto-gen drift.** Old generated `pages/(pilotiq)/` directories
  hang around between runs. Mitigation: bump the plugin's "version"
  marker comment so on the next run the generator detects the bump and
  rewrites every stub from scratch.
- **Reserved-token collision with cluster slug.** A cluster slug `theme`
  would shadow the theme editor route. Boot validation catches this
  (step 3) but the error message must point at the actual collision —
  not just "duplicate slug".
- **Find-by-path ambiguity.** `${base}/foo/bar` could be either:
  (a) `foo` cluster + `bar` resource, or (b) `foo` resource + `bar`
  record id. Resolution: cluster slug check FIRST. Resource slug `foo`
  with a registered cluster slug `foo` → boot fails (already covered
  by reserved-token guard).
- **Auth fall-through.** Cluster `canAccess` returning `false` must
  hide every child route (return 403), not just the nav entry. Tests
  cover both layers (panelInfo drops + route 403).
