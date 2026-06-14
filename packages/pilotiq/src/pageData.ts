/**
 * Per-page-role data builders. The framework's GET route handlers and
 * Vike's auto-generated `+data.ts` hooks both call these to produce the
 * exact props the page renderer needs.
 *
 * Why this exists: SSR runs through the rudder router (which calls
 * `view(...)` and populates `pageContext.viewProps`). SPA navigation only
 * triggers Vike's `+data` hook — the rudder handler doesn't run, so the
 * data needs to come from the same builder. Routing both paths through a
 * single builder keeps them in sync.
 */
import { PilotiqRegistry } from './PilotiqRegistry.js'

// Re-export `RelationChainStep` so external callsites importing it via
// `./pageData.js` keep working.
export type { RelationChainStep } from './pageData/breadcrumbs.js'

// Re-export `ServerDataMap` so external imports via `./pageData.js` keep
// working — the type is also surfaced from `packages/pilotiq/src/index.ts`.
export type { ServerDataMap } from './pageData/helpers.js'

// Re-export the URL-tag helpers + fill pipeline + server-data resolver
// for consumers that import them through `./pageData.js`.
export {
  applyEditPageHydrators,
  applyFillPipeline,
  applyRelationshipBuilderFill,
  applyRelationshipRepeaterFill,
  applyRelationshipSelectFill,
  callPageSchema,
  normalizeArrayFieldStrings,
  resolveServerDataElements,
  tagActionDispatch,
  tagCellEditUrls,
  tagFieldAiUrls,
  tagFormActions,
  tagFormStateUrls,
  tagFormWizardUrls,
  tagRichTextMentionUrls,
  tagSelectCreateOptionUrls,
  tagTableDeferred,
  tagTableReorderUrls,
  tagWidgetUrls,
} from './pageData/helpers.js'

// Re-export navigation chrome surface so external callsites importing
// it via `./pageData.js` keep working (e.g. routes/test harnesses).
export type {
  DatabaseNotificationsMeta,
  NavItem,
  PanelInfoRoute,
  RightPanelMeta,
  RightSidebarMeta,
  SettingsMeta,
  SettingsPaneMeta,
  UserMenuMeta,
} from './pageData/navigation.js'
export {
  applyRoleHooks,
  buildSettingsMeta,
  panelInfo,
  resolvePageHooks,
  resolveSettingsPanePage,
} from './pageData/navigation.js'

import {
  dashboardData,
  resourceCreateData,
  resourceEditData,
  resourceIndexData,
  resourceRecordPageData,
  resourceViewData,
} from './pageData/resourcePages.js'

// Re-export resource page builders so external callsites importing
// through `./pageData.js` keep working (e.g. routes.ts handlers, tests).
export {
  dashboardData,
  resolveActiveTab,
  resourceCreateData,
  resourceEditData,
  resourceIndexData,
  resourceRecordPageData,
  resourceTableData,
  resourceViewData,
} from './pageData/resourcePages.js'

import { relationManagerData } from './pageData/relationPages.js'

// Re-export relation manager builder surface for external consumers
// (routes.ts dispatches every relation-* role through these).
export type {
  RelationManagerResult,
  RelationManagerScope,
  ResolvedChain,
} from './pageData/relationPages.js'
export {
  findRelatedResource,
  relationManagerData,
  resolveRelationChain,
  safeManagerPolicy,
} from './pageData/relationPages.js'

// Re-export form-related builders + types for external callsites.
export type {
  FormCreateOptionFailure,
  FormCreateOptionRequest,
  FormCreateOptionSuccess,
  FormStateError,
  FormStateRequest,
  FormStateResult,
  FormStateScope,
  FormWizardFailure,
  FormWizardRequest,
  FormWizardSuccess,
} from './pageData/forms.js'
export {
  formCreateOptionData,
  formStateData,
  formWizardData,
  mentionResolveData,
} from './pageData/forms.js'

import {
  customPageData,
  globalEditData,
  globalViewData,
  settingsData,
} from './pageData/misc.js'

// Re-export the misc page builders for external callsites (routes.ts
// dispatches into globals / custom-page / widget / search routes).
export {
  customPageData,
  globalEditData,
  globalViewData,
  searchData,
  settingsData,
  widgetData,
} from './pageData/misc.js'
export type {
  WidgetFailure,
  WidgetRequest,
  WidgetScope,
  WidgetSuccess,
} from './pageData/misc.js'


// ─── Vike +data dispatcher ───────────────────────────────────

export interface PageContextLike {
  urlPathname?: string
  urlOriginal?: string
  urlParsed?:   { search?: Record<string, string>; searchOriginal?: string }
  routeParams?: Record<string, string | undefined>
  pageId?:      string
}

/**
 * Single entry point Vike's `+data` hook calls. Inspects the page id and
 * route params, finds the panel via `PilotiqRegistry`, and dispatches to
 * the matching builder. Returns the same shape SSR's `viewProps` carries.
 */
export async function dispatchPageData(pageContext: PageContextLike): Promise<unknown | null> {
  const { pageId, routeParams = {} } = pageContext
  const search = pageContext.urlParsed?.search ?? {}
  const basePathParam = routeParams['basePath']
  const basePath = basePathParam ? `/${basePathParam}` : ''
  const panel = basePath ? PilotiqRegistry.findByPath(basePath) : null

  if (!panel) return null

  switch (pageId) {
    case '/pages/(pilotiq)/dashboard':
      return dashboardData(panel)

    case '/pages/(pilotiq)/settings': {
      const paneId = routeParams['paneId']
      return settingsData(panel, paneId || undefined)
    }

    case '/pages/(pilotiq)/slug': {
      // 2-segment URL: could be a resource list, a global edit, or a custom page.
      const slug = routeParams['slug']
      if (!slug) return null
      const cfg = panel.getConfig()
      if (cfg.resources.some(R => R.getSlug() === slug)) {
        return resourceIndexData(panel, slug, search)
      }
      if (cfg.globals.some(G => G.getSlug() === slug)) {
        return globalEditData(panel, slug)
      }
      return customPageData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-create': {
      const slug = routeParams['slug']
      if (!slug) return null
      return resourceCreateData(panel, slug)
    }

    case '/pages/(pilotiq)/resource-edit': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug || !id) return null
      return resourceEditData(panel, slug, id)
    }

    case '/pages/(pilotiq)/resource-view': {
      const slug = routeParams['slug']
      const id = routeParams['id']
      if (!slug) return null
      // Globals also use this route under `/{slug}/view` — id will be 'view'.
      if (id === 'view') return globalViewData(panel, slug)
      if (!id) return null
      return resourceViewData(panel, slug, id)
    }

    case '/pages/(pilotiq)/relation-list': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-list', slug, recordId: id, relationship,
        query: search as Record<string, string>,
      })
      // Tagged failure shapes (`{ ok: false, status: 403 }`) leak straight
      // through to the +Page renderer, which can branch on the shape.
      // null = no manager named `relationship` on R; fall through to the
      // record sub-page lookup so URLs like `/admin/users/u1/activity`
      // (where `activity` is registered under `pages().record`) route
      // through `resourceRecordPageData` rather than 404ing.
      if (out !== null) return out as Record<string, unknown>
      const recordOut = await resourceRecordPageData(panel, slug, id, relationship)
      return recordOut === null ? null : (recordOut as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-create': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      if (!slug || !id || !relationship) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-create', slug, recordId: id, relationship,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-view': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      const childId      = routeParams['childId']
      if (!slug || !id || !relationship || !childId) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-view', slug, recordId: id, relationship, childId,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/relation-edit': {
      const slug         = routeParams['slug']
      const id           = routeParams['id']
      const relationship = routeParams['relationship']
      const childId      = routeParams['childId']
      if (!slug || !id || !relationship || !childId) return null
      const out = await relationManagerData(panel, {
        kind: 'relation-edit', slug, recordId: id, relationship, childId,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    // Phase B nested-relation routes. Param names match those declared
    // by the auto-gen Vike stubs in `src/vite.ts`:
    //   id, relationship, childId1, relationship2, childId2.
    case '/pages/(pilotiq)/nested-relation-list': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      if (!slug || !id || !relationship || !childId1 || !relationship2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-list', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        query: search as Record<string, string>,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-create': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      if (!slug || !id || !relationship || !childId1 || !relationship2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-create', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-view': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      const childId2      = routeParams['childId2']
      if (!slug || !id || !relationship || !childId1 || !relationship2 || !childId2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-view', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        childId: childId2,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    case '/pages/(pilotiq)/nested-relation-edit': {
      const slug          = routeParams['slug']
      const id            = routeParams['id']
      const relationship  = routeParams['relationship']
      const childId1      = routeParams['childId1']
      const relationship2 = routeParams['relationship2']
      const childId2      = routeParams['childId2']
      if (!slug || !id || !relationship || !childId1 || !relationship2 || !childId2) return null
      const out = await relationManagerData(panel, {
        kind: 'nested-relation-edit', slug,
        chain: [
          { recordId: id,       relationship },
          { recordId: childId1, relationship: relationship2 },
        ],
        childId: childId2,
      })
      return out === null ? null : (out as Record<string, unknown>)
    }

    default:
      return null
  }
}
