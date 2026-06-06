import type { ResourceClass } from '../Resource.js'
import {
  RelationManager,
  safeManagerPolicy as safeManagerPolicyImpl,
} from '../RelationManager.js'
import { RelationTabs, relationTab, type RelationTabMeta } from '../schema/RelationTabs.js'
import { resourceBasePath } from '../clusterPaths.js'
import type { IconValue } from '../icons/types.js'
import { getPrimaryKey } from '../orm/modelDefaults.js'
import type { RelationChainStep } from './breadcrumbs.js'
import { safeBool } from './helpers.js'

// ─── RelationTabs strip helpers ─────────────────────────────
//
// `buildRelationTabs` (depth 1) and `buildNestedRelationTabs` (depth 2)
// are called by both the resource view/edit page builders (parent
// tabs strip) AND the relation manager page builders (nested-tabs
// strip + record-sub-pages strip). Living in a shared module avoids
// pageData/resourcePages.ts ↔ pageData/relationPages.ts cycle.


/**
 * Phase B — build a `RelationTabs` strip scoped to a parent's nested
 * children (e.g. tabs for `replies / reactions` listed under a single
 * comment). The strip's "back" tab points to the depth-2 view page for
 * the leaf parent itself, then one tab per sibling nested manager.
 *
 * Only emitted when the depth-1 manager declares `M.relations()` —
 * absent that, callers skip the prepend so single-manager surfaces stay
 * clean. `activeKey` accepts the literal `'__view'` for the leaf
 * parent's view tab, or any sibling manager's relationship key.
 *
 * Per-tab `canX` gating (2026-05-11) — sibling nested-manager tabs run
 * `N.canViewAny(user, child1Record)` (with fall-through to the related
 * Resource via `safeManagerPolicy`) so the strip hides tabs the user
 * couldn't reach anyway. The back-link `__view` stays unconditional
 * since the user is already on a page scoped under `M.canViewAny` —
 * they reached this strip, they can navigate back to it.
 */
export async function buildNestedRelationTabs(
  R:             ResourceClass,
  M:             typeof RelationManager,
  basePath:      string,
  step0:         RelationChainStep,
  child1Id:      string,
  activeKey:     string,
  user:          unknown,
  child1Record:  unknown,
): Promise<RelationTabs | undefined> {
  // Same resource-level opt-out as the depth-1 strip.
  if (R.recordSubNavigation === false) return undefined

  const siblings = M.relations()
  if (siblings.length === 0) return undefined

  const resourceBase = resourceBasePath(basePath, R)
  const parentBase   = `${resourceBase}/${step0.recordId}/${step0.relationship}`

  // Sibling gating runs in parallel — each predicate may hit auth /
  // db, so don't serialize them.
  const siblingGates = siblings.map(N => {
    const Related = (N as unknown as { relatedResource?: ResourceClass }).relatedResource
    return safeManagerPolicyImpl(N, 'canViewAny', Related, user, child1Record)
  })
  const siblingVisible = await Promise.all(siblingGates)

  const tabs: RelationTabMeta[] = []

  // Back-link: depth-2 view page for the leaf parent record. Acts as
  // the "View" tab in the same way `__view` does on depth-1 strips.
  tabs.push(relationTab({
    key:       '__view',
    label:     M.getLabelSingular(),
    url:       `${parentBase}/${child1Id}`,
    active:    activeKey === '__view',
    icon:      M.getIcon(),
    iconOwner: M.name,
  }))

  siblings.forEach((N, i) => {
    if (!siblingVisible[i]) return
    let nestedRel: string
    try { nestedRel = N.getRelationship() } catch { return }
    const icon = N.getIcon()
    tabs.push(relationTab({
      key:    nestedRel,
      label:  N.getLabel(),
      url:    `${parentBase}/${child1Id}/${nestedRel}`,
      active: activeKey === nestedRel,
      ...(icon !== undefined ? { icon, iconOwner: N.name } : {}),
    }))
  })

  // After gating, only the back-link may remain — one tab isn't a
  // useful sub-nav. Drop the strip in that case (consistent with
  // depth-1's empty-tabs branch).
  if (tabs.length <= 1) return undefined

  return RelationTabs.make(tabs)
}

/**
 * Plan #11 — build the `RelationTabs` strip for a parent record. The
 * strip surfaces the per-record sub-navigation: View, Edit, plus one
 * tab per `R.relations()` manager. `activeKey` selects which tab the
 * renderer highlights — `'__view'` / `'__edit'` for the parent tabs,
 * the manager's relationship key for a manager tab.
 *
 * Sub-nav follow-up (2026-05-03 cont'd) — emit BOTH `__view` and
 * `__edit` as sibling tabs (record sub-navigation) instead of one
 * parent tab whose label depends on mode. Tabs are dropped when the
 * corresponding page role isn't registered (a Resource overriding
 * `pages()` to omit `view` or `edit` shouldn't surface a tab that
 * 404s).
 *
 * Per-tab `canX` gating (2026-05-11) — the strip now also evaluates
 * the matching predicate for each tab and drops the entry when the
 * user can't reach it. Routes still enforce; this is presentation
 * polish so the chrome doesn't promise a link that 403s on click.
 *
 *   - `__view`  → `R.canView(user, parentRecord)` (skip gating when
 *                 `parentRecord` is undefined — record load failed,
 *                 so the route's own load+gate will surface a 404/403
 *                 rather than the strip hiding silently).
 *   - `__edit`  → `R.canEdit(user, parentRecord)` (same posture).
 *   - manager  → `safeManagerPolicy(M, 'canViewAny', Related, user,
 *                 parentRecord)` (falls through to Related's
 *                 `canViewAny` when the manager hasn't overridden).
 *
 * Returns `undefined` when the resource has no relation managers — the
 * caller can then skip the prepend entirely so resources without
 * relations stay shape-compatible with their existing schemaData.
 * (View+Edit sub-nav alone isn't worth a tab strip; users navigate
 * those via headerActions or the back link.)
 */
export async function buildRelationTabs(
  R:            ResourceClass,
  recordId:     string,
  basePath:     string,
  activeKey:    string,
  user:         unknown,
  parentRecord: unknown,
): Promise<RelationTabs | undefined> {
  // Resource-level opt-out — drop the strip entirely (routes stay
  // registered; only the tab chrome disappears).
  if (R.recordSubNavigation === false) return undefined

  const managers       = R.relations()
  const recordPageMap  = R.getRecordPages()
  const recordPageSlugs = Object.keys(recordPageMap)
  // No managers AND no record sub-pages → no strip. View+Edit alone
  // isn't worth a tab strip; users navigate those via headerActions or
  // the back link. (When either is non-empty, the strip is worth
  // mounting even if all the dynamic tabs end up gated away — the
  // post-gate emptiness check below catches that.)
  if (managers.length === 0 && recordPageSlugs.length === 0) return undefined

  const resourceBase = resourceBasePath(basePath, R)
  const pages = R.resolvePages()

  // Evaluate every per-tab predicate in parallel. The arrays line up
  // 1:1 with `pages.view` / `pages.edit` / `recordPageSlugs` /
  // `managers` below — we resolve all gates first so the tab-build
  // loop stays straight-line.
  // Record-aware predicates short-circuit to `true` when no parent
  // record was loaded (presentation should never hide more aggressively
  // than the route can enforce; a missing record means the route will
  // 404/403 on click and the strip stays consistent with that).
  const canViewPromise = pages.view && parentRecord !== undefined && parentRecord !== null
    ? safeBool(() => R.canView(user, parentRecord))
    : Promise.resolve(true)
  const canEditPromise = pages.edit && parentRecord !== undefined && parentRecord !== null
    ? safeBool(() => R.canEdit(user, parentRecord))
    : Promise.resolve(true)
  const recordPageGates = recordPageSlugs.map(subSlug => {
    // Record sub-page gates run against the parent record verbatim —
    // missing record still calls the predicate so a sub-page that
    // gates on global user state (no record needed) still evaluates.
    // safeBool fails closed for throwing predicates.
    return safeBool(() => recordPageMap[subSlug]!.canAccess(user, parentRecord))
  })
  const managerGates    = managers.map(M => {
    const Related = (M as unknown as { relatedResource?: ResourceClass }).relatedResource
    return safeManagerPolicyImpl(M, 'canViewAny', Related, user, parentRecord)
  })
  const gateResults = await Promise.all([
    canViewPromise, canEditPromise,
    ...recordPageGates,
    ...managerGates,
  ])
  const canView         = gateResults[0] as boolean
  const canEdit         = gateResults[1] as boolean
  const recordPageVisible = gateResults.slice(2, 2 + recordPageSlugs.length) as boolean[]
  const managerVisible    = gateResults.slice(2 + recordPageSlugs.length)    as boolean[]

  const tabs: RelationTabMeta[] = []

  if (pages.view && canView) {
    tabs.push(relationTab({
      key:       '__view',
      label:     'View',
      url:       `${resourceBase}/${recordId}`,
      active:    activeKey === '__view',
      icon:      R.icon as IconValue | undefined,
      iconOwner: R.name,
    }))
  }

  if (pages.edit && canEdit) {
    tabs.push(relationTab({
      key:       '__edit',
      label:     'Edit',
      url:       `${resourceBase}/${recordId}/edit`,
      active:    activeKey === '__edit',
      // Re-use the resource icon so when ViewPage is pruned, Edit
      // still carries the visual identity. When both are present, the
      // icon repeats — acceptable; the labels disambiguate.
      icon:      R.icon as IconValue | undefined,
      iconOwner: R.name,
    }))
  }

  // Record sub-page tabs — between Edit and the managers, in declaration
  // order. Tab label inherits from the sub-page's class (`getLabel()`);
  // icon picks up the sub-page's static `icon` when set. Slug doubles as
  // the URL segment AND the `activeKey` discriminator the data builder
  // passes when rendering the sub-page.
  recordPageSlugs.forEach((subSlug, i) => {
    if (!recordPageVisible[i]) return
    const SubPage = recordPageMap[subSlug]!
    tabs.push(relationTab({
      key:       subSlug,
      label:     SubPage.getLabel(),
      url:       `${resourceBase}/${recordId}/${subSlug}`,
      active:    activeKey === subSlug,
      ...(SubPage.icon !== undefined
        ? { icon: SubPage.icon, iconOwner: SubPage.name }
        : {}),
    }))
  })

  managers.forEach((M, i) => {
    if (!managerVisible[i]) return
    let rel: string
    try { rel = M.getRelationship() } catch { return }
    const icon = M.getIcon()
    tabs.push(relationTab({
      key:    rel,
      label:  M.getLabel(),
      url:    `${resourceBase}/${recordId}/${rel}`,
      active: activeKey === rel,
      ...(icon !== undefined ? { icon, iconOwner: M.name } : {}),
    }))
  })

  // After gating, the strip may collapse to zero entries. Mirror the
  // "no managers + no sub-pages" branch above — no strip is friendlier
  // than a one-tab strip with just the active page.
  if (tabs.length === 0) return undefined

  return RelationTabs.make(tabs)
}

export { safeBool }

/** Pull a human-readable title off a parent record for breadcrumb /
 *  page-title use. Falls back through `recordTitleAttribute` →
 *  `name` → `title` → primary key value → 'Record'. */
export function deriveParentTitle(
  R:       ResourceClass,
  record:  unknown,
  manager?: typeof RelationManager,
): string {
  const r = record as Record<string, unknown>
  // Manager-scoped child rows prefer the manager's `recordTitleAttribute`
  // when set — the manager owns its presentation surface, and the related
  // Resource may not opt into the same column (e.g. nested-only Resources
  // that exist purely to back a manager).
  const managerAttr = manager?.recordTitleAttribute
  if (managerAttr && r[managerAttr] != null) return String(r[managerAttr])
  const attr = R.recordTitleAttribute
  if (attr && r[attr] != null) return String(r[attr])
  if (r['name']  != null) return String(r['name'])
  if (r['title'] != null) return String(r['title'])
  if (R.model) {
    const pk = getPrimaryKey(R.model)
    if (r[pk] != null) return String(r[pk])
  }
  return 'Record'
}
