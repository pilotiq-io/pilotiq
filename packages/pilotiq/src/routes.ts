import type { Router } from '@rudderjs/router'
import type { Pilotiq } from './Pilotiq.js'
import { Form } from './elements/Form.js'
import { dispatchFormSubmit, findForms, selectForm } from './elements/dispatchForm.js'
import { RESERVED_RELATIONSHIP_TOKENS } from './RelationManager.js'
import { Table } from './elements/Table.js'
import { Column } from './Column.js'
import type { ClusterClass } from './Cluster.js'

// `routes.ts` is split into a directory of focused modules under
// `./routes/`. This file is the orchestrator — boot-time validation
// loops + the per-Resource / per-Global / per-Page registration
// dispatchers. See `docs/plans/routes-split.md` for the per-phase map.
import { registerPanelRoutes }       from './routes/panel.js'
import { registerResourceRoutes }    from './routes/resources.js'
import { registerGlobalRoutes }      from './routes/globals.js'
import { registerCustomPageRoutes }  from './routes/pages.js'
import { registerThemeRoutes }       from './routes/theme.js'

export function registerPilotiqRoutes(
  router: Router,
  pilotiq: Pilotiq,
): void {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // Fail fast at boot — a silent 404 at request time is much harder to
  // debug than a clear error here. Dangling-reference checks run even
  // when `cfg.clusters` is empty.
  const clusterSet = new Set(cfg.clusters)
  const assertClusterRegistered = (
    kind:  'Resource' | 'Global' | 'Page',
    items: Array<{ name: string; cluster?: ClusterClass }>,
  ): void => {
    for (const item of items) {
      if (item.cluster === undefined) continue
      if (!clusterSet.has(item.cluster)) {
        throw new Error(
          `[Pilotiq] ${kind} ${item.name} references cluster ${item.cluster.name} which is not registered. ` +
          `Add it to Pilotiq.clusters([…]).`,
        )
      }
    }
  }
  assertClusterRegistered('Resource', cfg.resources)
  assertClusterRegistered('Global',   cfg.globals)
  assertClusterRegistered('Page',     cfg.pages)

  if (cfg.clusters.length > 0) {
    const seenClusterSlug = new Set<string>()
    for (const C of cfg.clusters) {
      const s = C.getSlug()
      if (s === '' || /^_/.test(s) || s === 'theme' || s === 'api') {
        throw new Error(
          `[Pilotiq] Cluster ${C.name} uses reserved slug "${s}". ` +
          `Cluster slugs cannot be empty, start with "_", or equal "theme" / "api".`,
        )
      }
      if (seenClusterSlug.has(s)) {
        throw new Error(
          `[Pilotiq] Two clusters share slug "${s}". Cluster slugs must be unique.`,
        )
      }
      seenClusterSlug.add(s)
    }
    // Top-level (no cluster) child slugs must not collide with cluster
    // slugs — `<panel-base>/<slug>` would resolve to the cluster first.
    const assertNoSlugCollision = <T extends { name: string; cluster?: ClusterClass; getSlug(): string }>(
      kind:  'Resource' | 'Global' | 'Page',
      items: T[],
      skip?: (item: T) => boolean,
    ): void => {
      for (const item of items) {
        if (item.cluster || (skip?.(item) ?? false)) continue
        if (seenClusterSlug.has(item.getSlug())) {
          const hint = kind === 'Resource'
            ? ` Either rename the resource or move it inside the cluster.`
            : ''
          throw new Error(
            `[Pilotiq] ${kind} ${item.name} slug "${item.getSlug()}" collides with a registered cluster slug.${hint}`,
          )
        }
      }
    }
    assertNoSlugCollision('Resource', cfg.resources)
    assertNoSlugCollision('Global',   cfg.globals)
    assertNoSlugCollision('Page',     cfg.pages, P => P === cfg.dashboardPage)
    // landingPage sanity — a cluster's landing page must be inside the
    // cluster (or the redirect would jump out of the cluster URL space).
    for (const C of cfg.clusters) {
      const lp = C.landingPage
      if (lp === undefined) continue
      if (!cfg.pages.includes(lp)) {
        throw new Error(
          `[Pilotiq] Cluster ${C.name}.landingPage references ${lp.name} which is not registered in Pilotiq.pages([…]).`,
        )
      }
      if (lp.cluster !== C) {
        throw new Error(
          `[Pilotiq] Cluster ${C.name}.landingPage = ${lp.name}, but ${lp.name}.cluster does not point back at ${C.name}.`,
        )
      }
    }
  }

  // Plan #11 — fail fast at boot when any relation manager's
  // `relationship` collides with a reserved URL token. A silent 404 at
  // request time is much harder to debug.
  //
  // Phase B nested resources — same validation walks managers declared
  // via `M.relations()` (one level deep). Depth-3+ is rejected here too:
  // declaring `relations()` on a nested manager isn't supported in
  // Phase B (Filament also caps at depth 2).
  for (const R of cfg.resources) {
    for (const M of R.relations()) {
      const rel = M.getRelationship()
      if (RESERVED_RELATIONSHIP_TOKENS.has(rel)) {
        throw new Error(
          `[Pilotiq] RelationManager ${M.name} on ${R.name} uses reserved relationship "${rel}". ` +
          `Reserved tokens: ${[...RESERVED_RELATIONSHIP_TOKENS].join(', ')}. Rename it.`,
        )
      }
      for (const N of M.relations()) {
        const nestedRel = N.getRelationship()
        if (RESERVED_RELATIONSHIP_TOKENS.has(nestedRel)) {
          throw new Error(
            `[Pilotiq] Nested RelationManager ${N.name} under ${M.name} on ${R.name} uses reserved relationship "${nestedRel}". ` +
            `Reserved tokens: ${[...RESERVED_RELATIONSHIP_TOKENS].join(', ')}. Rename it.`,
          )
        }
        if (N.relations().length > 0) {
          throw new Error(
            `[Pilotiq] Nested RelationManager ${N.name} under ${M.name} on ${R.name} declares its own relations(). ` +
            `Phase B caps nesting at depth 2 (admin-table reference frameworks cap at depth 2 too). Drop the nested relations() override.`,
          )
        }
      }
    }
  }

  // Record sub-pages — boot-time validation of slugs declared under
  // `Resource.pages().record`. The route URL is
  // `${resourceBase}/${slug}/:id/${subPageSlug}`, so the sub-page slug
  // shares the same URL slot as a relation-manager's relationship. We
  // run the slug-pattern check, the reserved-token check, and the
  // manager-collision check before mounting any routes — a misconfigured
  // sub-page is a dev-time error, not a runtime 404.
  const RECORD_PAGE_SLUG_PATTERN = /^[A-Za-z0-9_-]+$/
  for (const R of cfg.resources) {
    const recordPages = R.getRecordPages()
    const subPageSlugs = Object.keys(recordPages)
    if (subPageSlugs.length === 0) continue
    const managerSlugs = new Set(R.relations().map(M => M.getRelationship()))
    for (const subPageSlug of subPageSlugs) {
      if (!RECORD_PAGE_SLUG_PATTERN.test(subPageSlug)) {
        throw new Error(
          `[Pilotiq] Record sub-page slug ${JSON.stringify(subPageSlug)} on ${R.name} ` +
          `must match /^[A-Za-z0-9_-]+$/. Rename it.`,
        )
      }
      if (RESERVED_RELATIONSHIP_TOKENS.has(subPageSlug)) {
        throw new Error(
          `[Pilotiq] Record sub-page slug "${subPageSlug}" on ${R.name} collides with a reserved URL token. ` +
          `Reserved tokens: ${[...RESERVED_RELATIONSHIP_TOKENS].join(', ')}. Rename it.`,
        )
      }
      if (managerSlugs.has(subPageSlug)) {
        throw new Error(
          `[Pilotiq] Record sub-page slug "${subPageSlug}" on ${R.name} collides with relation manager relationship "${subPageSlug}". ` +
          `Sub-page slugs and relation slugs share the same URL slot — rename one.`,
        )
      }
    }
  }

  // Reorderable rows — fail fast at boot when a Resource declares
  // `Table.reorderable()` but the bound model can't actually persist a
  // new order. We invoke `R.table(Table.make())` once per resource (the
  // same call shape `defaultPages` uses at request time) and inspect
  // `_reorderableColumn`. The model.reorder check is symmetric with
  // Plan #13's restore/forceDelete guards. Result is cached per-resource
  // so the route loop below can decide whether to mount `_reorder`.
  const reorderEnabled = new Map<string, string>() // slug → column
  for (const R of cfg.resources) {
    let probeColumn: string | undefined
    try { probeColumn = R.table(Table.make()).getReorderableColumn() }
    catch { continue }   // user-side throw — not a reorder concern
    if (probeColumn === undefined) continue
    if (!R.model || typeof R.model.reorder !== 'function') {
      throw new Error(
        `[Pilotiq] ${R.name}.table() calls reorderable("${probeColumn}") but the bound model has no reorder(ids) method. ` +
        `Implement \`async reorder(ids)\` on the rudder Model (or remove the .reorderable() call).`,
      )
    }
    reorderEnabled.set(R.getSlug(), probeColumn)
  }

  // Editable cell columns — fail fast at boot when a Resource declares
  // at least one TextInput/Toggle/SelectColumn but the bound model
  // can't persist a single-column update. Mirrors the reorder guard
  // above. Result is cached per-resource so the route loop below can
  // decide whether to mount `_cell`.
  const editableEnabled = new Set<string>()
  for (const R of cfg.resources) {
    let hasEditable: boolean
    try {
      hasEditable = (R.table(Table.make()).getChildren() ?? [])
        .some(c => c instanceof Column && c.isEditable())
    } catch { continue }
    if (!hasEditable) continue
    if (!R.model || typeof R.model.update !== 'function') {
      throw new Error(
        `[Pilotiq] ${R.name}.table() declares an editable cell column ` +
        `(TextInputColumn / ToggleColumn / SelectColumn) but the bound ` +
        `model has no update(id, data) method. Set Resource.model = M ` +
        `(rudder ORM convention) or drop the editable column.`,
      )
    }
    editableEnabled.add(R.getSlug())
  }

  // ── Panel-level sibling routes ────────────────────────
  // Dashboard, _uploads, _widget, _search, _notifications.
  // Pulled out 2026-05-12 (Phase 2 of the routes.ts split).
  registerPanelRoutes(router, pilotiq, base)

  // ── Resource routes ───────────────────────────────────
  // List / view / create / edit / delete + soft-delete / actions /
  // widgets / deferred-table / reorder / per-row editable cells / the
  // four form-state companion endpoints / record sub-pages. Each
  // Resource also fans out into its registered relation managers
  // (depth-1 + depth-2). Pulled out 2026-05-12 (Phase 5 of the
  // routes.ts split).
  for (const R of cfg.resources) {
    registerResourceRoutes(router, pilotiq, R, base, {
      reorderable: reorderEnabled.has(R.getSlug()),
      editable:    editableEnabled.has(R.getSlug()),
    })
  }

  // ── Globals (singletons — 2-segment, no /:id) ────────
  // Pulled out 2026-05-12 (Phase 3 of the routes.ts split).
  for (const G of cfg.globals) {
    registerGlobalRoutes(router, pilotiq, G, base)
  }

  // ── Custom pages (2-segment, slug route) ──────────────
  // Pulled out 2026-05-12 (Phase 3 of the routes.ts split).
  for (const PageClass of cfg.pages) {
    // The dashboard page lives at `${base}` (panel routes handle it);
    // skip it here so we don't register a duplicate `${pageUrl}` route
    // or a broken `${base}/` (when `slug = ''`).
    if (cfg.dashboardPage === PageClass) continue
    registerCustomPageRoutes(router, pilotiq, PageClass, base)
  }

  // ── Theme editor ──────────────────────────────────────
  // Pulled out 2026-05-12 (Phase 3 of the routes.ts split).
  if (cfg.themeEditor) {
    registerThemeRoutes(router, pilotiq, base)
  }

  // Plugin route hook — runs AFTER all core routes register so plugins
  // can mount their own HTTP surface alongside the panel's. Order
  // matches the registration order on `.use()` / `.plugins([…])`. Each
  // plugin owns its own URL convention; pilotiq's underscore-prefixed
  // sibling-route precedent (`_search`, `_uploads`, `_widget`,
  // `_notifications`) is the recommended shape. Failures inside a
  // plugin's hook propagate — boot order is "register all core, then
  // each plugin in order"; a throw on hook N stops hooks N+1..N+M.
  for (const plugin of pilotiq.getPlugins()) {
    plugin.registerRoutes?.(router, pilotiq)
  }
}

// ─── Lifecycle helpers exported for tests ────────────────
export { dispatchFormSubmit, findForms, selectForm }
export { loadTableRecords, parseTableQuery, findTables } from './elements/dispatchTable.js'
export type { Form }
