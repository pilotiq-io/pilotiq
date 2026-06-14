import type { Pilotiq, PilotiqConfig } from '../Pilotiq.js'
import { livePanel } from '../PilotiqRegistry.js'
import type { Page, PageCollabConfig } from '../Page.js'
import type { ResourceClass, NavigationBadgeColor, ResourceCollabConfig } from '../Resource.js'
import type { GlobalClass } from '../Global.js'
import type { ClusterClass } from '../Cluster.js'
import { resourceBasePath, globalBasePath, pageBasePath } from '../clusterPaths.js'
import type { ElementMeta } from '../schema/Element.js'
import { resolveTheme } from '../theme/resolve.js'
import { resolvePanelI18n } from '../i18n/resolve.js'
import type { ThemeMeta } from '../theme/types.js'
import { serializeIcon, type SerializedIcon } from '../icons/types.js'
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
} from '../RightPanel.js'
import type { UserMenuItemMeta } from '../UserMenuItem.js'
import {
  resolveRenderHooks,
  CHROME_HOOK_NAMES,
  type RenderHookContext,
  type RenderHookMap,
  type RenderHookName,
} from '../RenderHook.js'
import { applyPageHooks, pageHooksFor, type PageRole } from '../applyPageHooks.js'
import {
  notificationChannel,
  NOTIFICATION_CREATED_EVENT,
} from '../notifications/broadcast.js'
import { safeBool } from './helpers.js'

// ─── Navigation chrome ──────────────────────────────────────
//
// `panelInfo` is the entry point every SSR + SPA-nav data hook calls
// to build the static chrome envelope (branding / theme / navigation
// tree / user menu / database-notifications meta / right sidebar meta
// / page-role render hooks). Returns a snapshot that's safe to ship
// over the wire; references like component classes get rendered down
// to serializable shapes here.


// ─── Shared helpers ──────────────────────────────────────────

/**
 * Top-right user dropdown shipped to the renderer in `viewProps.panel`.
 * `null` when no `Pilotiq.user(req => …)` resolver is configured or the
 * resolver returns `null` (no logged-in user) — the renderer suppresses
 * the dropdown entirely in that case.
 *
 * `user.name / user.email / user.avatar` are duck-typed off the
 * resolver's return value; whichever fields are present round-trip into
 * the dropdown trigger (initials fall back to the first two letters of
 * `name` when no avatar URL is set).
 */
export interface UserMenuMeta {
  user:     { name?: string; email?: string; avatar?: string }
  items:    UserMenuItemMeta[]
  signOut?: { url: string; label: string; method: 'POST' | 'GET' }
}

/**
 * Bell-icon dropdown configuration shipped under `viewProps.panel`. Sparse —
 * absent when `Pilotiq.databaseNotifications()` wasn't called OR when no
 * user resolves (anonymous request → no inbox to surface). Renderer mounts
 * the bell only when this is set.
 *
 * Routes are absolute URLs (panel `basePath` already applied). Client
 * substitutes `:id` per row when calling read / unread; `_widget`-style
 * params aren't used here because the bell only ever issues these four
 * fetch shapes.
 *
 * `polling` mirrors `DatabaseNotificationsConfig.polling` — `null` ships
 * over the wire to disable client-side polling. The bell still fetches on
 * mount + after every mark-read mutation.
 */
export interface DatabaseNotificationsMeta {
  position:    'topbar' | 'sidebar'
  polling:     number | null
  pageSize:    number
  badgeColor:  NavigationBadgeColor
  trigger?:    { icon?: string; label?: string }
  listUrl:     string
  readAllUrl:  string
  /** Template URL with literal `:id` placeholder. Client replaces. */
  readUrl:     string
  /** Template URL with literal `:id` placeholder. Client replaces. */
  unreadUrl:   string
  /**
   * Template URL for the notification-action dispatch endpoint with
   * literal `:id` and `:actionName` placeholders. Bell client builds
   * per-action URLs by substituting both at render time. Used only by
   * `handler`-mode actions; `url` / `post` actions ride their own URL
   * verbatim.
   */
  actionUrl:   string
  /**
   * Phase 2 — broadcast hint. Sparse — absent when
   * `databaseNotifications({ broadcast: true })` wasn't set OR when no
   * resolved user has an `id` to scope the channel to.
   *
   * Client connects to `wsUrl` via `@rudderjs/broadcast`'s
   * `RudderSocket`, subscribes to the `channel` (already includes the
   * `private-` prefix), and listens for `event` to trigger refetches.
   */
  broadcast?: {
    wsUrl:   string
    channel: string
    event:   string
  }
}

/**
 * Right-sidebar shipped under `viewProps.panel.rightSidebar`. Sparse —
 * absent from `panelInfo()` when no contributions are registered, every
 * registered contribution failed `canAccess(user)`, or every visible
 * contribution is `hidden: true`. Renderer mounts the chrome only when
 * this is set.
 *
 * The React component reference for each contribution does NOT travel
 * here — only its tab-strip metadata. The actual body component is
 * resolved client-side from the Vite plugin's `_components.ts` manifest
 * keyed by contribution `id`, mirroring the icon-class round-trip.
 *
 * `defaultWidth` rolls up: contribution-level value when one
 * contribution was registered with one, otherwise the panel-level
 * baseline (`RIGHT_PANEL_DEFAULT_WIDTH`). Client also clamps
 * localStorage values to `[minWidth, maxWidth]`.
 */
export interface RightPanelMeta {
  id:           string
  label:        string
  icon?:        SerializedIcon
  defaultWidth: number
}

export interface RightSidebarMeta {
  panels:       RightPanelMeta[]
  defaultWidth: number
  minWidth:     number
  maxWidth:     number
}

/**
 * One System Settings pane's rail metadata, shipped under
 * `viewProps.panel.settings.panes`. The `render` component reference does
 * NOT travel here — only its rail meta. The body is resolved client-side
 * from the Vite plugin's `settingsPaneRegistry` keyed by `id`, mirroring
 * the right-panel + icon round-trip. `href` panes link away instead.
 */
export interface SettingsPaneMeta {
  id:     string
  label:  string
  icon?:  SerializedIcon
  group?: string
  href?:  string
}

/**
 * Settings shell meta shipped under `viewProps.panel.settings`. Sparse —
 * absent from `panelInfo()` when no panes are registered (and no profile
 * page), every pane failed `canAccess(user)`, or every survivor is
 * `hidden`. The gear "Settings" nav entry mirrors this presence.
 *
 * `defaultPaneId` is the first render-type pane (the one
 * `${base}/settings` redirects to).
 */
export interface SettingsMeta {
  panes:          SettingsPaneMeta[]
  defaultPaneId?: string
}

/**
 * Single nav-tree entry. `name` is the JS class name (`R.name` /
 * `G.name` / `P.name`) — also the lookup key into the build-time
 * `_components.ts` manifest the Vite plugin emits, so component-typed
 * icons resolve from the same identifier.
 */
export interface NavItem {
  name:        string
  label:       string
  url:         string
  icon?:       SerializedIcon
  group?:      string
  sort?:       number
  badge?:      string
  badgeColor?: NavigationBadgeColor
  children?:   NavItem[]
}

/**
 * Build the panel header summary + the unified navigation tree.
 *
 * Pipeline:
 *   1. flatten resources + globals + pages into raw NavItem records
 *   2. drop items whose `canAccess(user)` (Plan #10) returns false
 *   3. resolve `navigationParentItem` references → nest under parents
 *      (cycles broken with a console warn; dangling parents render at top level)
 *   4. sort within each grouping (top-level *and* every parent's children)
 *      by `navigationSort` ascending → registration order
 *   5. resolve every `navigationBadge()` in parallel via `Promise.all`;
 *      handler errors are swallowed (badge omitted) so a flaky count
 *      never blanks the page
 *
 * `req` is the active request; pilotiq calls `pilotiq.resolveUser(req)`
 * once and threads the user into every Resource/Global/Page `canAccess`
 * check. When `Pilotiq.user(fn)` isn't configured, user is `null` and the
 * default `canAccess` returns true → no items dropped.
 */
/**
 * Optional route-context for `panelInfo()`. When set, render-hook
 * `scope: { resource | page | global }` filters fire correctly for the
 * active route. Missing keys mean the slot has no scope-able identifier
 * (chrome-only routes); scope-less hooks still fire either way.
 *
 * `url` defaults to `cfg.path` when unset. `recordId` rides through to
 * `RenderHookContext.recordId` for hooks that need it.
 */
export interface PanelInfoRoute {
  resource?: ResourceClass
  page?:     typeof Page
  global?:   GlobalClass
  recordId?: string
  url?:      string
}

/**
 * Per-resource collab opt-in map, keyed by the URL slug
 * `parseRecordPageUrl` produces. Non-clustered resource → `getSlug()`;
 * clustered resource → `${cluster.getSlug()}/${R.getSlug()}`.
 *
 * `RecordWrapperGate` reads this map to decide whether the page tree
 * needs the plugin-registered RecordWrapper (collab room, audit, …)
 * mounted around the record view/edit content area.
 *
 * Nested-relation edit URLs (`/articles/123/comments/456/edit`) have a
 * dynamic-id segment in the gate's URL slug and don't match here in v1.
 * Collab on nested-relation edits is a follow-up — top-level resource
 * edits are the common case and ship now.
 */
export type RecordCollabMap = Record<string, ResourceCollabConfig>

function resourceSlugForGate(R: ResourceClass): string {
  return R.cluster ? `${R.cluster.getSlug()}/${R.getSlug()}` : R.getSlug()
}

function buildRecordCollabMap(cfg: Readonly<PilotiqConfig>): RecordCollabMap | undefined {
  const map: RecordCollabMap = {}
  for (const R of cfg.resources) {
    const collab = R.getResolvedCollabConfig()
    if (collab) map[resourceSlugForGate(R)] = collab
  }
  return Object.keys(map).length > 0 ? map : undefined
}

/**
 * Per-custom-page collab opt-in map, keyed by the page's URL slug
 * (cluster-prefixed for clustered pages). `CustomPageWrapperGate`
 * reads this to decide whether to mount the plugin-registered
 * custom-page wrapper (collab room, audit trail, …) around the page
 * content area.
 *
 * Resource-bound default pages (List/Create/Edit/View) never appear
 * here — `Page.getResolvedCollabConfig()` returns `null` for them.
 * Record-scoped collab is governed by `Resource.collab` and lands on
 * `recordCollab`.
 */
export type PageCollabMap = Record<string, PageCollabConfig>

function pageSlugForGate(P: typeof Page): string {
  const slug = P.getSlug()
  return P.cluster ? `${P.cluster.getSlug()}/${slug}` : slug
}

function buildPageCollabMap(cfg: Readonly<PilotiqConfig>): PageCollabMap | undefined {
  const map: PageCollabMap = {}
  for (const P of cfg.pages) {
    const collab = P.getResolvedCollabConfig()
    if (collab) map[pageSlugForGate(P)] = collab
  }
  return Object.keys(map).length > 0 ? map : undefined
}

export async function panelInfo(
  pilotiq: Pilotiq,
  req?:    unknown,
  route:   PanelInfoRoute = {},
) {
  pilotiq = livePanel(pilotiq) // dev HMR: resolve the latest panel, not the registration-time closure
  const cfg = pilotiq.getConfig()
  const merged = pilotiq.getMergedTheme()
  const theme: ThemeMeta | undefined = merged ? resolveTheme(merged) : undefined
  const user = await pilotiq.resolveUser(req)
  const [navigation, userMenu, renderHooks, rightSidebar, settings, i18n] = await Promise.all([
    buildNavigation(pilotiq, user),
    buildUserMenu(pilotiq, user),
    resolveChromeHooks(pilotiq, user, route),
    buildRightSidebarMeta(cfg, user),
    buildSettingsMeta(cfg, user),
    resolvePanelI18n(),
  ])
  const databaseNotifications = buildDatabaseNotificationsMeta(cfg, user)
  const recordCollab = buildRecordCollabMap(cfg)
  const pageCollab = buildPageCollabMap(cfg)
  // AI suggestion mode — sparse: omit when 'review' (the default — AppShell
  // falls back to it) so the wire shape stays minimal for panels that don't
  // opt into auto mode. Plugin clients (e.g. @pilotiq-pro/ai's
  // `AiClientToolBindings`) read this to decide whether to apply writes
  // immediately or stage them as PendingSuggestions for user approval.
  const aiSuggestionsMode = pilotiq.getAiSuggestionsMode()
  return {
    name: cfg.name,
    branding: cfg.branding,
    navigation,
    theme,
    themeEditor: cfg.themeEditor ?? false,
    ...(cfg.sidebar ? { sidebar: cfg.sidebar } : {}),
    ...(userMenu ? { userMenu } : {}),
    ...(databaseNotifications ? { databaseNotifications } : {}),
    ...(rightSidebar ? { rightSidebar } : {}),
    ...(settings ? { settings } : {}),
    ...(recordCollab ? { recordCollab } : {}),
    ...(pageCollab ? { pageCollab } : {}),
    ...(Object.keys(renderHooks).length > 0 ? { renderHooks } : {}),
    ...(aiSuggestionsMode !== 'review' ? { aiSuggestionsMode } : {}),
    ...(i18n ? { i18n } : {}),
  }
}

/**
 * Build the bell-icon meta. Returns `null` when:
 *   - `Pilotiq.databaseNotifications()` was never called, OR
 *   - no user resolves (no inbox to surface).
 *
 * Defaults follow Filament: 30s polling, 25 rows per page, primary
 * badge color, topbar position.
 */
export function buildDatabaseNotificationsMeta(
  cfg:  Readonly<PilotiqConfig>,
  user: unknown,
): DatabaseNotificationsMeta | null {
  if (!cfg.databaseNotifications?.enabled) return null
  if (user === null || user === undefined) return null

  const dn   = cfg.databaseNotifications
  const base = cfg.path
  const meta: DatabaseNotificationsMeta = {
    position:   dn.position   ?? 'topbar',
    polling:    dn.polling    === null ? null : (dn.polling ?? 30),
    pageSize:   dn.pageSize   ?? 25,
    badgeColor: dn.badgeColor ?? 'primary',
    listUrl:    `${base}/_notifications`,
    readAllUrl: `${base}/_notifications/read-all`,
    readUrl:    `${base}/_notifications/:id/read`,
    unreadUrl:  `${base}/_notifications/:id/unread`,
    actionUrl:  `${base}/_notifications/:id/_action/:actionName`,
  }
  if (dn.trigger) meta.trigger = { ...dn.trigger }
  // Phase 2 broadcast hint — only ship when broadcast is enabled AND the
  // resolved user has an `id` to scope the channel to. The client uses
  // `wsUrl` for the WebSocket connection and `channel` for the subscribe
  // call (the private- prefix is already baked in).
  if (dn.broadcast) {
    const userId = (user as { id?: unknown } | null | undefined)?.id
    if (userId !== undefined && userId !== null) {
      const wsUrl = typeof dn.broadcast === 'object' && dn.broadcast.wsUrl
        ? dn.broadcast.wsUrl
        : ''  // empty = client falls back to same-origin /ws
      meta.broadcast = {
        wsUrl,
        channel: notificationChannel(String(userId)),
        event:   NOTIFICATION_CREATED_EVENT,
      }
    }
  }
  return meta
}

/**
 * Build the right-sidebar meta from registered contributions. Returns
 * `null` when:
 *
 *   - no contributions were registered, OR
 *   - every contribution failed `canAccess(user)` (or its predicate
 *     threw — fail-closed), OR
 *   - every passing contribution is `hidden: true` (no tab-strip
 *     surface to mount; programmatic-open consumers should ship at
 *     least one visible tab).
 *
 * Visible contributions are sorted by `sort` ascending (default 100),
 * with registration order as a stable tiebreaker. Each entry's icon is
 * serialized through `serializeIcon` keyed on the contribution `id`
 * (Phase B's Vite plugin extends `_components.ts` to round-trip
 * component-typed icons under that key). `defaultWidth` rolls up:
 * panel-level baseline is `RIGHT_PANEL_DEFAULT_WIDTH`; per-contribution
 * overrides ride on `RightPanelMeta.defaultWidth`.
 *
 * Errors thrown by `canAccess` are swallowed (the contribution is
 * dropped + a single console warn is emitted) so a flaky predicate on
 * one pane never blanks the whole sidebar.
 */
export async function buildRightSidebarMeta(
  cfg:  Readonly<PilotiqConfig>,
  user: unknown,
): Promise<RightSidebarMeta | null> {
  const list = cfg.rightPanels ?? []
  if (list.length === 0) return null

  const indexed = list.map((c, idx) => ({ c, idx }))
  const gated = await Promise.all(
    indexed.map(async ({ c, idx }) => {
      if (c.canAccess) {
        try {
          const ok = await c.canAccess(user)
          if (!ok) return null
        } catch (err) {
           
          console.warn(`[Pilotiq] rightPanel "${c.id}" canAccess threw — dropping`, err)
          return null
        }
      }
      return { c, idx }
    }),
  )

  const visible = gated
    .filter((x): x is { c: typeof list[number]; idx: number } => x !== null)
    .filter((x) => !x.c.hidden)
    .sort((a, b) => {
      const sa = a.c.sort ?? 100
      const sb = b.c.sort ?? 100
      if (sa !== sb) return sa - sb
      return a.idx - b.idx
    })

  if (visible.length === 0) return null

  const panels: RightPanelMeta[] = visible.map(({ c }) => {
    const meta: RightPanelMeta = {
      id:           c.id,
      label:        c.label ?? c.id,
      defaultWidth: c.defaultWidth ?? RIGHT_PANEL_DEFAULT_WIDTH,
    }
    if (c.icon !== undefined) {
      meta.icon = serializeIcon(c.icon, c.id)
    }
    return meta
  })

  return {
    panels,
    defaultWidth: panels[0]?.defaultWidth ?? RIGHT_PANEL_DEFAULT_WIDTH,
    minWidth:     RIGHT_PANEL_MIN_WIDTH,
    maxWidth:     RIGHT_PANEL_MAX_WIDTH,
  }
}

/**
 * Build the System Settings shell meta — the section-rail panes for the
 * current user. Mirrors `buildRightSidebarMeta`: gate each pane by
 * `canAccess(user)` in parallel (fail-closed + warn), drop hidden, sort
 * by `sort` ascending (registration order ties).
 *
 * Two pane sources merge: the registered `cfg.settingsPanes`
 * contributions (render + href) AND a synthesized "Profile" href pane
 * when `cfg.profilePage` is set — surfacing the existing profile editor
 * in Settings without a rebuild. The synthesized pane is gated by the
 * profile Page's own `canAccess`.
 *
 * Returns `null` when no accessible, non-hidden pane survives — the gear
 * nav entry + route both key off this.
 */
export async function buildSettingsMeta(
  cfg:  Readonly<PilotiqConfig>,
  user: unknown,
): Promise<SettingsMeta | null> {
  const list = cfg.settingsPanes ?? []

  const indexed = list.map((c, idx) => ({ c, idx }))
  const gated = await Promise.all(
    indexed.map(async ({ c, idx }) => {
      if (c.canAccess) {
        try {
          const ok = await c.canAccess(user)
          if (!ok) return null
        } catch (err) {
          console.warn(`[Pilotiq] settingsPane "${c.id}" canAccess threw — dropping`, err)
          return null
        }
      }
      return { c, idx }
    }),
  )

  const visible = gated
    .filter((x): x is { c: typeof list[number]; idx: number } => x !== null)
    .filter((x) => !x.c.hidden)
    .sort((a, b) => {
      const sa = a.c.sort ?? 100
      const sb = b.c.sort ?? 100
      if (sa !== sb) return sa - sb
      return a.idx - b.idx
    })

  const panes: SettingsPaneMeta[] = visible.map(({ c }) => {
    const meta: SettingsPaneMeta = { id: c.id, label: c.label }
    if (c.icon !== undefined)  meta.icon  = serializeIcon(c.icon, c.id)
    if (c.group !== undefined) meta.group = c.group
    if (c.href !== undefined)  meta.href  = c.href
    return meta
  })

  // Synthesize the Profile pane from `cfg.profilePage` — a page-backed
  // pane that renders the profile Page's schema INSIDE the settings shell
  // (rail persists), rather than linking away. Gated by the Page's own
  // canAccess. The Page's standalone route still works.
  const P = cfg.profilePage
  if (P) {
    let ok = true
    try { ok = await P.canAccess(user) } catch { ok = false }
    if (ok) {
      const profilePane: SettingsPaneMeta = {
        id:    '__profile',
        label: P.getLabel(),
        group: 'General',
      }
      const icon = serializeIcon(P.getNavigationIcon() ?? 'user-circle', P.name)
      if (icon !== undefined) profilePane.icon = icon
      panes.push(profilePane)
    }
  }

  if (panes.length === 0) return null

  const defaultPaneId = panes.find(p => !p.href)?.id
  const meta: SettingsMeta = { panes }
  if (defaultPaneId !== undefined) meta.defaultPaneId = defaultPaneId
  return meta
}

/**
 * Map a settings pane id to its backing `Page` (for page-backed panes
 * that render in-shell). Returns `undefined` for render / href panes.
 * `__profile` resolves to `cfg.profilePage`; registered panes resolve via
 * their `page` field. Used by `settingsData` to resolve the in-shell
 * schema.
 */
export function resolveSettingsPanePage(
  cfg:    Readonly<PilotiqConfig>,
  paneId: string,
): typeof Page | undefined {
  if (paneId === '__profile') return cfg.profilePage
  return cfg.settingsPanes?.find(p => p.id === paneId)?.page
}

/**
 * Resolve every chrome render hook (body / topbar / sidebar / user-menu
 * / footer / head). Returns a sparse map — slots with no matching
 * registered entries are omitted so the wire payload stays minimal on
 * panels that don't use render hooks at all.
 */
export async function resolveChromeHooks(
  pilotiq: Pilotiq,
  user:    unknown,
  route:   PanelInfoRoute,
): Promise<RenderHookMap> {
  const cfg = pilotiq.getConfig()
  const entries = cfg.renderHooks ?? []
  if (entries.length === 0) return {}
  const ctx: RenderHookContext = {
    user,
    basePath: cfg.path,
    url:      route.url ?? cfg.path,
  }
  if (route.resource !== undefined) ctx.resource = route.resource
  if (route.page     !== undefined) ctx.page     = route.page
  if (route.global   !== undefined) ctx.global   = route.global
  if (route.recordId !== undefined) ctx.recordId = route.recordId
  return resolveRenderHooks(entries, CHROME_HOOK_NAMES, ctx)
}

/**
 * Resolve a subset of page-role render hooks (e.g. `panels::page.start`
 * + the list-records / create-record / view-record / edit-record /
 * global-search slot families). Per-page-role data builders call this
 * after schema resolution and stamp the result on `viewProps.renderHooks`.
 *
 * `names` lets each builder declare exactly which slots it serves so a
 * list-page builder doesn't ship slots that only fire on the edit page.
 */
/**
 * Per-builder one-shot — resolve the role's slot set + splice the
 * results into the resolved schema. Wraps the two steps a per-builder
 * data fn always does in lockstep:
 *
 *   1. `resolvePageHooks(pilotiq, user, pageHooksFor(role), route)`
 *   2. `applyPageHooks(schemaData, hooks, role)`
 *
 * Returns the wrapped `ElementMeta[]`. No-op when the panel has no
 * registered hooks. Pass through what you'd pass to `panelInfo()`'s
 * route arg — same shape.
 */
export async function applyRoleHooks(
  pilotiq:    Pilotiq,
  user:       unknown,
  role:       PageRole,
  schemaData: ElementMeta[],
  route:      PanelInfoRoute = {},
): Promise<ElementMeta[]> {
  const cfg = pilotiq.getConfig()
  if (!cfg.renderHooks || cfg.renderHooks.length === 0) return schemaData
  const hooks = await resolvePageHooks(pilotiq, user, pageHooksFor(role), route)
  return applyPageHooks(schemaData, hooks, role)
}

export async function resolvePageHooks(
  pilotiq: Pilotiq,
  user:    unknown,
  names:   readonly RenderHookName[],
  route:   PanelInfoRoute,
): Promise<RenderHookMap> {
  const cfg = pilotiq.getConfig()
  const entries = cfg.renderHooks ?? []
  if (entries.length === 0 || names.length === 0) return {}
  const ctx: RenderHookContext = {
    user,
    basePath: cfg.path,
    url:      route.url ?? cfg.path,
  }
  if (route.resource !== undefined) ctx.resource = route.resource
  if (route.page     !== undefined) ctx.page     = route.page
  if (route.global   !== undefined) ctx.global   = route.global
  if (route.recordId !== undefined) ctx.recordId = route.recordId
  return resolveRenderHooks(entries, names, ctx)
}


/**
 * Build the top-right user-menu meta. Returns `null` when:
 *   - `Pilotiq.user()` isn't configured, or
 *   - the resolver returned `null` (anonymous request), or
 *   - the user object has no extractable identity AND the panel
 *     configured no items / no sign-out (nothing to render).
 *
 * Items resolve in parallel with their visibility predicates
 * (`UserMenuItem.visible`). Throwing predicates fail closed (item
 * dropped). Sort by `.sort(n)` ascending → registration order.
 */
export async function buildUserMenu(pilotiq: Pilotiq, user: unknown): Promise<UserMenuMeta | null> {
  if (user === null || user === undefined) return null

  const cfg = pilotiq.getConfig()
  const items = cfg.userMenuItems ?? []
  const ctx = { user }

  // Resolve every item in parallel. `null` returns mean "filtered by
  // visibility predicate" — drop them. Indexed pre-sort so stable ties
  // resolve to registration order.
  const resolved = await Promise.all(
    items.map(async (item, idx) => {
      try {
        const meta = await item.resolve(ctx)
        return meta ? { meta, idx, sort: item.getSort() } : null
      } catch {
        return null
      }
    }),
  )
  const visibleItems = resolved
    .filter((x): x is { meta: UserMenuItemMeta; idx: number; sort: number | undefined } => x !== null)
    .sort((a, b) => {
      const aHas = a.sort !== undefined, bHas = b.sort !== undefined
      if (aHas && bHas) return a.sort! - b.sort! || a.idx - b.idx
      if (aHas)         return -1
      if (bHas)         return  1
      return a.idx - b.idx
    })
    .map(x => x.meta)

  // Auto-inject the profile entry from `cfg.profilePage` when set.
  // Prepended (Filament-style) so it always sits at the top of the
  // dropdown regardless of user-authored item ordering. Falls through
  // its own `canAccess(user)` so per-user gating works without the
  // user repeating the predicate at the menu level.
  const profileItem = await buildProfileMenuItem(cfg, user)
  const finalItems  = profileItem ? [profileItem, ...visibleItems] : visibleItems

  const meta: UserMenuMeta = {
    user:  extractUserIdentity(user),
    items: finalItems,
  }
  if (cfg.signOut) {
    meta.signOut = {
      url:    cfg.signOut.url,
      label:  cfg.signOut.label  ?? 'Sign out',
      method: cfg.signOut.method ?? 'POST',
    }
  }
  return meta
}

/** Build the auto-injected profile entry from `cfg.profilePage`. The
 *  Page's `static label` / `static icon` win; defaults `'Edit profile'`
 *  + `'user-circle'` (registry-resolved). Returns `null` when no
 *  profile page is configured or `Page.canAccess(user)` denies. */
export async function buildProfileMenuItem(
  cfg: Readonly<PilotiqConfig>,
  user: unknown,
): Promise<UserMenuItemMeta | null> {
  const P = cfg.profilePage
  if (!P) return null
  if (!(await safeBool(() => P.canAccess(user)))) return null
  const url  = pageBasePath(cfg.path, P)
  const icon = serializeIcon(P.icon ?? 'user-circle', P.name)
  const meta: UserMenuItemMeta = {
    name:  '__profile',
    label: P.label ?? 'Edit profile',
    url,
  }
  if (icon !== undefined) meta.icon = icon
  return meta
}

/** Duck-type the user object for display fields. We never throw — a
 *  user resolver might return literally anything (a primitive, a class
 *  instance with getters, a plain object) and the dropdown should
 *  degrade gracefully (initials fallback to '?' when no name found). */
export function extractUserIdentity(user: unknown): { name?: string; email?: string; avatar?: string } {
  if (user === null || user === undefined) return {}
  if (typeof user !== 'object') return { name: String(user) }
  const obj = user as Record<string, unknown>
  const out: { name?: string; email?: string; avatar?: string } = {}
  const name = obj.name ?? obj.fullName ?? obj.displayName ?? obj.username
  if (typeof name   === 'string' && name)   out.name   = name
  if (typeof obj.email === 'string' && obj.email) out.email = obj.email
  const avatar = obj.avatar ?? obj.avatarUrl ?? obj.image
  if (typeof avatar === 'string' && avatar) out.avatar = avatar
  return out
}

/** @internal Internal node before nesting; carries the registration index
 *  so we can stable-sort by it as the tie-breaker. */
interface RawNavItem extends NavItem {
  parent?: string
  /** Registration index across resources → globals → pages (in that order),
   *  so resources beat globals on a sort tie within the same group. */
  _idx: number
}

/** Plan #10 — stamp the resolved user onto a SchemaContext so action
 *  visibility predicates can see it during `resolveSchema`. The `user`
 *  field is opaque (whatever `Pilotiq.user(req => …)` returns); skipped
 *  when null/undefined to keep ctx tidy. */
export async function buildNavigation(pilotiq: Pilotiq, user: unknown): Promise<NavItem[]> {
  const cfg = pilotiq.getConfig()
  const base = cfg.path

  // Flatten + resolve badges in parallel. We build the raw list first so
  // every entry has its identity (`name`) and parent set; badges resolve
  // alongside.
  const raw: RawNavItem[] = []
  let idx = 0

  const pushBadge: Array<{ item: RawNavItem; handler: () => unknown; owner: string }> = []

  // Plan #10 — pre-evaluate canAccess for every owner in parallel so we
  // can drop forbidden items before flattening. Failed predicates fail
  // closed (treated as `false`) so a thrown auth check doesn't accidentally
  // expose nav items. Clusters compose: a child gated through its
  // cluster's `canAccess` returning false drops the child even when the
  // child's own predicate would have passed.
  const [resourceAccess, globalAccess, pageAccess, clusterAccess] = await Promise.all([
    Promise.all(cfg.resources.map(R => safeBool(() => R.canAccess(user)))),
    Promise.all(cfg.globals.map(G => safeBool(() => G.canAccess(user)))),
    Promise.all(cfg.pages.map(P => safeBool(() => P.canAccess(user)))),
    Promise.all(cfg.clusters.map(C => safeBool(() => C.canAccess(user)))),
  ])

  // Identity-keyed so two clusters that happen to share a `.name`
  // (minifier collisions, hot-reload duplicate imports) don't clobber.
  const clusterAccessByClass = new Map<ClusterClass, boolean>()
  cfg.clusters.forEach((C, i) => clusterAccessByClass.set(C, !!clusterAccess[i]))

  const firstChildUrlByCluster = new Map<ClusterClass, string>()
  const recordChildUrl = (cluster: ClusterClass, url: string) => {
    if (!firstChildUrlByCluster.has(cluster)) firstChildUrlByCluster.set(cluster, url)
  }

  for (let i = 0; i < cfg.resources.length; i++) {
    const R = cfg.resources[i]!
    if (!resourceAccess[i]) continue
    if (R.cluster && !clusterAccessByClass.get(R.cluster)) continue
    const url = resourceBasePath(base, R)
    if (R.cluster) recordChildUrl(R.cluster, url)
    const item: RawNavItem = {
      name:  R.name,
      label: R.getNavigationLabel(),
      url,
      icon:  serializeIcon(R.getNavigationIcon(), R.name),
      _idx:  idx++,
    }
    if (R.navigationGroup        !== undefined) item.group        = R.navigationGroup
    if (R.navigationSort         !== undefined) item.sort         = R.navigationSort
    // Cluster nesting wins over `navigationParentItem`. Both being set
    // is a misconfiguration; cluster placement is the structural one.
    if (R.cluster)                              item.parent       = R.cluster.name
    else if (R.navigationParentItem !== undefined) item.parent    = R.navigationParentItem
    if (R.navigationBadgeColor   !== 'default') item.badgeColor   = R.navigationBadgeColor
    if (R.navigationBadge)                       pushBadge.push({ item, handler: R.navigationBadge, owner: R.name })
    raw.push(item)
  }

  for (let i = 0; i < cfg.globals.length; i++) {
    if (!globalAccess[i]) continue
    const G = cfg.globals[i]!
    if (G.cluster && !clusterAccessByClass.get(G.cluster)) continue
    // Globals default `navigationGroup` to `'Settings'`. Allow `null` as
    // an explicit opt-out → render at top level.
    const group = G.navigationGroup === null ? undefined : G.navigationGroup
    const url = globalBasePath(base, G)
    if (G.cluster) recordChildUrl(G.cluster, url)
    const item: RawNavItem = {
      name:  G.name,
      label: G.getNavigationLabel(),
      url,
      icon:  serializeIcon(G.getNavigationIcon(), G.name),
      _idx:  idx++,
    }
    if (group                    !== undefined) item.group        = group
    if (G.navigationSort         !== undefined) item.sort         = G.navigationSort
    if (G.cluster)                              item.parent       = G.cluster.name
    else if (G.navigationParentItem !== undefined) item.parent    = G.navigationParentItem
    if (G.navigationBadgeColor   !== 'default') item.badgeColor   = G.navigationBadgeColor
    if (G.navigationBadge)                       pushBadge.push({ item, handler: G.navigationBadge, owner: G.name })
    raw.push(item)
  }

  for (let i = 0; i < cfg.pages.length; i++) {
    if (!pageAccess[i]) continue
    const P = cfg.pages[i]!
    // The profile page is surfaced in the user menu + the Settings rail —
    // never as a standalone sidebar entry. (Routing stays registered.)
    if (cfg.profilePage === P) continue
    if (P.cluster && !clusterAccessByClass.get(P.cluster)) continue
    // The dashboard page collapses its nav URL to `${base}` so the
    // sidebar entry deep-links to the panel root rather than
    // `${base}/${P.getSlug()}` (which would 404 — the slug route skips
    // the dashboard page at boot).
    const isDashboard = cfg.dashboardPage === P
    const url = isDashboard ? base : pageBasePath(base, P)
    if (P.cluster && !isDashboard) recordChildUrl(P.cluster, url)
    const item: RawNavItem = {
      name:  P.name,
      label: P.getNavigationLabel(),
      url,
      icon:  serializeIcon(P.getNavigationIcon(), P.name),
      _idx:  idx++,
    }
    if (P.navigationGroup        !== undefined) item.group        = P.navigationGroup
    if (P.navigationSort         !== undefined) item.sort         = P.navigationSort
    if (P.cluster && !isDashboard)              item.parent       = P.cluster.name
    else if (P.navigationParentItem !== undefined) item.parent    = P.navigationParentItem
    if (P.navigationBadgeColor   !== 'default') item.badgeColor   = P.navigationBadgeColor
    if (P.navigationBadge)                       pushBadge.push({ item, handler: P.navigationBadge, owner: P.name })
    raw.push(item)
  }

  // Clusters render as first-class nav items. Each gets a URL pointing
  // at its `landingPage` (when set + accessible) or its first accessible
  // child. Clusters whose every child was gated out are dropped silently
  // — same posture as `navigationParentItem` with no resolvable parent.
  for (let i = 0; i < cfg.clusters.length; i++) {
    if (!clusterAccess[i]) continue
    const C = cfg.clusters[i]!
    let url: string | undefined
    if (C.landingPage) {
      const lpIdx = cfg.pages.indexOf(C.landingPage)
      if (lpIdx !== -1 && pageAccess[lpIdx]) {
        url = cfg.dashboardPage === C.landingPage ? base : pageBasePath(base, C.landingPage)
      }
    }
    if (url === undefined) url = firstChildUrlByCluster.get(C)
    if (url === undefined) continue   // empty cluster — drop entirely
    const item: RawNavItem = {
      name:  C.name,
      label: C.getNavigationLabel(),
      url,
      icon:  serializeIcon(C.getNavigationIcon(), C.name),
      _idx:  idx++,
    }
    if (C.navigationGroup        !== undefined) item.group        = C.navigationGroup
    if (C.navigationSort         !== undefined) item.sort         = C.navigationSort
    if (C.navigationParentItem   !== undefined) item.parent       = C.navigationParentItem
    if (C.navigationBadgeColor   !== 'default') item.badgeColor   = C.navigationBadgeColor
    if (C.navigationBadge)                       pushBadge.push({ item, handler: C.navigationBadge, owner: C.name })
    raw.push(item)
  }

  // System Settings — a single top-level "Settings" gear entry that opens
  // the settings shell. Replaces the old standalone "Theme" nav link
  // (Theme is now a pane inside Settings). Appended last so it sorts to
  // the end of the ungrouped items. Gated on the same per-user pane
  // resolution the shell + route use, so it disappears when every pane is
  // inaccessible.
  const settings = await buildSettingsMeta(cfg, user)
  if (settings) {
    raw.push({
      name:  '__settings',
      label: 'Settings',
      url:   `${base}/settings`,
      icon:  'settings',
      // Last raw entry pushed — no further `idx` reads, so no increment.
      _idx:  idx,
    })
  }

  await Promise.all(pushBadge.map(async ({ item, handler, owner }) => {
    try {
      const v = await pilotiq.resolveNavigationBadge(owner, user, async () => {
        const raw = await handler()
        return raw === undefined || raw === null ? undefined : String(raw)
      })
      if (v !== undefined) item.badge = v
    } catch {
      // Per-badge errors stay silent.
    }
  }))

  return nestAndSort(raw)
}

/**
 * Resolve `parent` references → nest, drop cycles, sort within each
 * grouping, then strip internal scaffolding (`parent`, `_idx`).
 */
export function nestAndSort(raw: RawNavItem[]): NavItem[] {
  const byName = new Map<string, RawNavItem>()
  for (const it of raw) byName.set(it.name, it)

  // Detect parent cycles: walk upwards from each item; any name seen
  // twice → cycle. Items in a cycle get treated as top-level.
  const inCycle = new Set<string>()
  for (const it of raw) {
    if (it.parent === undefined) continue
    const seen = new Set<string>([it.name])
    let cur: string | undefined = it.parent
    while (cur !== undefined) {
      if (seen.has(cur)) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(`[Pilotiq] navigationParentItem cycle detected at "${it.name}" — rendering at top level.`)
        }
        inCycle.add(it.name)
        break
      }
      seen.add(cur)
      const parent = byName.get(cur)
      if (!parent) break
      cur = parent.parent
    }
  }

  const childrenOf = new Map<string, RawNavItem[]>()
  const top: RawNavItem[] = []
  for (const it of raw) {
    const parent = it.parent
    if (parent && byName.has(parent) && !inCycle.has(it.name)) {
      const list = childrenOf.get(parent) ?? []
      list.push(it)
      childrenOf.set(parent, list)
    } else {
      top.push(it)
    }
  }

  // Sort items in a sibling group by sort (asc), ties → registration order.
  const sortItems = (items: RawNavItem[]): RawNavItem[] => {
    return [...items].sort((a, b) => {
      const aHas = a.sort !== undefined, bHas = b.sort !== undefined
      if (aHas && bHas)  return a.sort! - b.sort! || a._idx - b._idx
      if (aHas)          return -1   // sorted items come before unsorted
      if (bHas)          return  1
      return a._idx - b._idx
    })
  }

  // Strip internals + recurse into children.
  const finalize = (items: RawNavItem[]): NavItem[] =>
    sortItems(items).map(it => {
      const kids = childrenOf.get(it.name)
      const { parent: _parent, _idx, ...rest } = it
      const out: NavItem = { ...rest }
      if (kids && kids.length > 0) out.children = finalize(kids)
      return out
    })

  return finalize(top)
}
