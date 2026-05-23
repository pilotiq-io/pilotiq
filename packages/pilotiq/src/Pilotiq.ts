import type * as React from 'react'
import type { Router } from '@rudderjs/router'
import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { ClusterClass } from './Cluster.js'
import type { Page } from './Page.js'
import type { SchemaDefinition } from './schema/resolveSchema.js'
import type { ThemeConfig } from './theme/types.js'
import type { ThemeStorageAdapter } from './theme/storage.js'
import type { UploadAdapter } from './uploads/UploadAdapter.js'
import type { UserMenuItem } from './UserMenuItem.js'
import type { NavigationBadgeColor } from './Resource.js'
import type {
  RenderHookEntry,
  RenderHookFn,
  RenderHookName,
  RenderHookScope,
} from './RenderHook.js'
import type { NotificationActionHandler } from './notifications/types.js'
import {
  validateRightPanel,
  findDuplicateRightPanelId,
  type RightPanelContribution,
} from './RightPanel.js'
import type {
  NavComponentProps,
  HeaderComponentProps,
  FooterComponentProps,
} from './react/component-slots.js'

export type PilotiqLayout = 'sidebar' | 'topbar'

/**
 * Sidebar chrome options for the `'sidebar'` layout. Maps 1:1 onto the
 * underlying shadcn `<Sidebar>` primitive; ignored under the `'topbar'`
 * layout. All keys are optional — unset falls back to the panel default
 * (`inset` / `icon` / `left`).
 */
export interface PilotiqSidebarOptions {
  /** Surface treatment. `inset` floats the content in a rounded card
   *  (the default); `floating` floats the sidebar itself; `sidebar` is
   *  the classic full-height flush rail. */
  variant?:     'sidebar' | 'floating' | 'inset'
  /** Collapse behavior. `icon` collapses to an icon rail (default);
   *  `offcanvas` slides fully off-screen; `none` disables collapsing. */
  collapsible?: 'offcanvas' | 'icon' | 'none'
  /** Which edge the rail docks to. `left` (default) is RTL-aware. */
  side?:        'left' | 'right'
}

/** Plugin interface for extending Pilotiq panels. */
export interface PilotiqPlugin {
  name: string
  /** Called when `.use()` / `.plugins([…])` runs at panel-build time —
   *  mutate config as needed (register a right-sidebar contribution,
   *  register a field renderer, seed an internal registry, install a
   *  `Field.prototype` augment, etc). Idempotent under HMR / re-mount. */
  register(panel: Pilotiq): void
  /**
   * Optional — called by `registerPilotiqRoutes(router, pilotiq)` AFTER
   *  the core routes are mounted, so plugins can register their own
   *  HTTP surface alongside the panel's. The mount order matches the
   *  order plugins were registered via `.use()` / `.plugins([…])`.
   *
   *  Use this for plugin-owned endpoints (`POST {base}/_chat`,
   *  `POST {base}/_collab`, …) — the path prefix should mirror
   *  pilotiq's own underscore-prefixed precedent (`_search`,
   *  `_uploads`, `_widget`, `_notifications`).
   *
   *  Skip this hook for plugins that only mutate panel config; nothing
   *  inside core walks plugins outside `register()` / `registerRoutes()`.
   */
  registerRoutes?(router: Router, pilotiq: Pilotiq): void
}

/**
 * User resolver — receives the request and returns the current user (or
 * null). Pilotiq treats the user object as opaque; whatever the resolver
 * returns is forwarded into `Resource.canX(user, …)` / `Global.canX(...)` /
 * `Page.canAccess(user)` and into `Action` visibility rules. Sync or async.
 *
 * Apps using `@rudderjs/auth` typically pass `req => Auth.user()`. The
 * resolver is optional — when unset, every `can*` predicate runs with
 * `user === null` and the defaults (which return `true`) keep the panel
 * working with no auth wired up.
 */
export type UserResolver = (req: unknown) => unknown | null | Promise<unknown | null>

/**
 * Server-side hook handed to `Pilotiq.editPageHydrator(fn)`. The
 * resource-edit data builder calls every registered hydrator after the
 * standard fill pipeline (`loadRecord` → `mutateFormDataBeforeFill` →
 * `fillFromRecord` → `mutateFormDataAfterFill` →
 * `applyRelationshipRepeaterFill` → `applyRelationshipBuilderFill`) and
 * merges each non-null return onto the form's default values.
 *
 * Multiple hydrators are walked in registration order; later hydrators
 * override keys produced by earlier ones. A hydrator returning `null`
 * (or throwing) is a pass-through — the DB row values survive intact.
 *
 * Designed for the SSR-from-Y.Doc consumer in `@pilotiq-pro/collab`:
 * read persisted Y.Text + Y.Map values for the record and override the
 * matching field defaults, killing the DB → Y.Doc value flicker on
 * hydration. Other consumers (per-tenant overrides, A/B experiments,
 * draft-snapshot resume) compose the same way.
 *
 * Pilotiq core stays Yjs-free — the hook's `Record<string, unknown>`
 * return is opaque, so the collab consumer's Yjs imports stay confined
 * to its own `/server` subpath.
 */
export interface EditPageHydratorContext {
  /** The Resource class being edited (server-side reference, not the
   *  serialized meta — gives access to `model`, `getSlug()`, etc.). */
  resource:      ResourceClass
  /** Record id from the URL, stringified. */
  recordId:      string
  /** Values produced by the fill pipeline so far — DB row → hooks →
   *  relationship fills. Hydrators read this to make merge decisions
   *  (e.g. "only override fields that have content in Y.Doc"). */
  currentValues: Record<string, unknown>
}

export type EditPageHydrator = (
  ctx: EditPageHydratorContext,
) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>

/**
 * Upload configuration. Apps register an adapter via `Pilotiq.uploads({
 * adapter })`; the `_uploads` route hands every incoming file to it.
 * Without an adapter, `FileUpload` fields render but the upload POST
 * fails with a clear "no upload adapter configured" error.
 */
export interface UploadConfig {
  adapter: UploadAdapter
}

/**
 * Database notifications configuration. Wired through
 * `Pilotiq.databaseNotifications(opts?)`.
 *
 * Pilotiq stores rows on the `notification` table shipped by
 * `@rudderjs/notification` (`prisma/schema/notification.prisma`). The
 * panel consumes that table directly via `@rudderjs/orm`'s
 * `ModelRegistry` adapter so apps that already have rudder's
 * `NotificationProvider` running can read existing rows alongside ones
 * authored by `Notification.make(...).sendToDatabase(recipient)`.
 *
 * `position` chooses where the bell mounts in the panel chrome.
 * `'topbar'` (default) sits between `<ThemeToggle>` and `<UserMenu>` in
 * both the sidebar and topbar layouts; `'sidebar'` moves it into the
 * sidebar footer (parity with Filament's
 * `DatabaseNotificationsPosition::Sidebar`).
 *
 * `polling` is the seconds between background refetches. `null`
 * disables auto-polling — the bell fetches once on mount and after
 * mark-read mutations. Filament default is 30 seconds; we mirror that.
 *
 * `pageSize` caps the list endpoint's page size (default 25).
 *
 * `badgeColor` recolors the unread-count pill on the bell trigger.
 * Default `'primary'`. Reuses the same `NavigationBadgeColor` palette
 * that the sidebar nav badges use.
 *
 * `trigger.icon` overrides the bell icon (registry name); `trigger.label`
 * overrides the trigger's `aria-label`.
 *
 * `notifiableType` is the value pilotiq writes/reads against the
 * `notifiable_type` column. Defaults to `'users'` to match
 * `@rudderjs/notification`'s `DatabaseChannel`. Override when your app
 * stores rows tagged for a different notifiable.
 */
export interface DatabaseNotificationsConfig {
  /** Where the bell mounts. Default `'topbar'`. */
  position?: 'topbar' | 'sidebar'
  /** Auto-poll interval in seconds. `null` disables. Default `30`. */
  polling?:  number | null
  /** Max rows the list endpoint returns. Default `25`. */
  pageSize?: number
  /** Unread badge color on the bell trigger. Default `'primary'`. */
  badgeColor?: NavigationBadgeColor
  /** Bell trigger overrides. */
  trigger?:  { icon?: string; label?: string }
  /** `notifiable_type` column value. Default `'users'`. */
  notifiableType?: string
  /**
   * Phase 2 — push new rows over WebSocket on
   * `private-pilotiq-notifications.${user.id}` so the bell client can
   * refetch immediately instead of waiting for the next poll. Requires
   * `@rudderjs/broadcast` (the `BroadcastingProvider` must be in the
   * app's providers list and the `RudderSocket` client must be vendored).
   *
   * Soft-fails when broadcast isn't installed — pilotiq still works,
   * the bell just falls back to polling.
   *
   * Pass a string to override the WebSocket URL the client connects to
   * (default: same-origin `ws://…/ws`). Most apps leave this on the
   * default — `@rudderjs/broadcast`'s `BroadcastConfig.path` already
   * mounts the upgrade handler at `/ws`.
   */
  broadcast?: boolean | { wsUrl?: string }
}

/**
 * Sign-out configuration. Wired through `Pilotiq.signOut(url | config)`.
 *
 * The user menu renders the sign-out entry as a `<form method="POST"
 * action={url}>` so CSRF middleware downstream can validate the request
 * (a bare `<a href>` would be GET-only). Set `method: 'GET'` for
 * traditional logout endpoints that redirect on a normal navigation.
 */
export interface SignOutConfig {
  url:     string
  label?:  string
  method?: 'POST' | 'GET'
}

export interface PilotiqConfig {
  name:          string
  path:          string
  layout:        PilotiqLayout
  /** Sidebar chrome options — honored only under the `'sidebar'` layout.
   *  Absent → primitive defaults (`inset` / `icon` / `left`). */
  sidebar?:      PilotiqSidebarOptions
  resources:     ResourceClass[]
  globals:       GlobalClass[]
  pages:         (typeof Page)[]
  clusters:      ClusterClass[]
  branding:      { title?: string; logo?: string }
  schema?:       SchemaDefinition
  /**
   * Plan #15 — homepage page class. When set, `GET ${base}` resolves
   * this Page's `static schema()` instead of the builder-level
   * `schema()`. Set via `panel.dashboard(P)`. The page is also added
   * to `cfg.pages` for nav + canAccess gating, with its nav URL
   * collapsed back to `${base}` so the sidebar entry deep-links to
   * the panel root.
   */
  dashboardPage?: typeof Page
  /**
   * Profile page — when set, the user-menu dropdown auto-prepends an
   * entry pointing at this Page's URL. The Page is registered in
   * `cfg.pages` for routing + nav + canAccess gating. The menu entry's
   * label and icon read from the Page's `static label` / `static icon`
   * (with `'Edit profile'` and `'user-circle'` defaults).
   *
   * The Page is otherwise a normal `Page` subclass — author the form
   * (`static schema()`) against your own auth model since pilotiq
   * treats the user object as opaque.
   */
  profilePage?: typeof Page
  theme?:        ThemeConfig
  themeEditor?:  boolean
  /**
   * Theme override persistence adapter — wired via
   * `themeEditor({ storage })`. Reads/writes the JSON blob the editor
   * page produces. Without this, the service provider falls back to
   * the implicit Prisma adapter (auto-resolved via
   * `app.make('prisma')`) for back-compat — that fallback is
   * deprecated and will be removed in a future minor; pass `storage`
   * explicitly.
   */
  themeStorage?: ThemeStorageAdapter
  guard?:        (req: unknown) => boolean | Promise<boolean>
  user?:         UserResolver
  uploads?:      UploadConfig
  /**
   * Top-right user-menu entries (between user identity and sign-out).
   * Order: items with explicit `.sort(n)` ascending, ties → registration
   * order; unsorted items follow in registration order.
   */
  userMenuItems?: UserMenuItem[]
  /** Sign-out endpoint config — when set, the user menu appends a
   *  separator + Sign-out entry. Without this, the menu shows custom
   *  items (if any) and the user identity, but no sign-out affordance. */
  signOut?:      SignOutConfig
  /** Server-side hydrators applied after the fill pipeline on every
   *  resource edit page. Empty / unset → behaviour unchanged. See
   *  `EditPageHydrator` for the contract; plugins register via
   *  `panel.editPageHydrator(fn)`. */
  editPageHydrators?: EditPageHydrator[]
  /** Database notifications — opt-in. Mounts the bell + 4 endpoints
   *  (`_notifications` list / `:id/read` / `:id/unread` / `read-all`).
   *  Reads rows from `@rudderjs/notification`'s `notification` table via
   *  `@rudderjs/orm`'s `ModelRegistry` adapter, scoped to
   *  `pilotiq.resolveUser(req).id`. */
  databaseNotifications?: DatabaseNotificationsConfig & { enabled: true }
  /**
   * Named notification-action handlers. Registered via
   * `Pilotiq.notificationHandlers({ name: fn })`. Looked up by the
   * `_notifications/:id/_action/:actionName` route at request time when
   * a stored action carries `handler: 'name'`.
   *
   * The closure-handler path on Action (`.handler(async ctx => …)`)
   * works for transient toasts but doesn't survive a `data` JSON
   * round-trip — this registry is the persistence-safe escape hatch.
   */
  notificationHandlers?: Record<string, NotificationActionHandler>
  /**
   * Render-hook entries registered via `Pilotiq.renderHook(name, fn,
   * scope?)`. Resolved per-request by `panelInfo()` (chrome slots) and
   * the per-page-role data builders (page-role slots).
   */
  renderHooks?:  RenderHookEntry[]
  /**
   * Right-sidebar plugin contributions registered via
   * `Pilotiq.rightPanel(c)` / `Pilotiq.rightPanels([c, …])`. Each entry
   * is auth-gated, sorted, and serialized into `panel.rightSidebar`
   * under `panelInfo()`. Empty / all-gated → `panel.rightSidebar` is
   * absent and the chrome doesn't mount.
   */
  rightPanels?:  RightPanelContribution[]
  /**
   * Layout-level provider components registered via
   * `Pilotiq.layoutProvider(C)` / `Pilotiq.layoutProviders([…])`. Plugins
   * register React providers (e.g. an AI chat queue context, a tenant
   * theme switcher) that wrap the panel's `<AppShell>` children — so
   * the providers are in scope for every page in the panel, not just
   * specific component slots. Order matters: the first registered
   * provider sits closest to the root (outermost wrap); the last sits
   * closest to the page tree (innermost wrap).
   */
  layoutProviders?: LayoutProviderComponent[]
  /**
   * Build-time component overrides for panel chrome slots. Registered
   * via `Pilotiq.components({ nav })`. The Vite plugin harvests the
   * actual React refs into `pages/(pilotiq)/_components.ts`; component
   * refs never travel over the wire.
   *
   * v1 ships only the `nav` slot — full replacement of the sidebar's
   * `<SidebarContent>` body and the topbar's `<nav>` element. Other
   * slots (`header`, `footer`, …) will land when a concrete consumer
   * asks; the shape is open-ended so additions don't break this
   * surface.
   */
  components?:      ComponentSlots
  /**
   * AI suggestion mode — controls what happens when an AI agent calls a
   * write tool against a form field.
   *
   * - `'auto'` (default): the write applies immediately to the form state.
   *   Existing behavior — agents take effect as soon as the tool returns.
   * - `'review'`: the write is staged as a `PendingSuggestion` and the
   *   field shows an inline diff (text fields) or current → suggested
   *   comparison (other types) with Approve / Reject buttons. Approve
   *   runs the field's registered applier; Reject discards.
   *
   * VS Code-style review flow. Plan: `docs/plans/ai-review-mode.md`.
   */
  aiSuggestionsMode?: 'auto' | 'review'
  /** @internal Runtime theme overrides from DB. */
  _themeOverrides?: Partial<ThemeConfig>
  /**
   * TTL (milliseconds) for the per-user navigation badge cache. Set to
   * `0` (or `null` via the builder) to disable caching. Default 30000.
   */
  navigationBadgeTtlMs?: number
}

/**
 * Shape a layout-provider component must implement. Receives the
 * standard layout context (`basePath`, panel children) so providers can
 * thread panel-aware values into their context — e.g. an AI chat
 * provider needs `basePath` to know where to POST chat requests.
 */
export type LayoutProviderComponent = React.ComponentType<{
  children: React.ReactNode
  basePath?: string
}>

/**
 * Chrome-slot overrides registered through `Pilotiq.components({ … })`.
 *
 * Three slots ship today:
 *
 * - `nav` — replaces the default nav tree (`<SidebarMenu>` body in
 *   `SidebarLayout`, the `<nav>` cluster in `TopbarLayout`). Surrounding
 *   chrome (branding header, render-hook splices, footer, sign-out
 *   menu) stays.
 * - `header` — replaces the whole `<header>` chrome bar. In
 *   `SidebarLayout` that's the top bar with search / theme / bell /
 *   user menu; in `TopbarLayout` that's the whole top region including
 *   the brand cluster AND the nav (setting `header` makes `nav`
 *   irrelevant in `TopbarLayout`). Render hooks that splice INSIDE the
 *   default header (`panels::topbar.*`, `panels::user-menu.*`) don't
 *   fire when the header is replaced — the surrounding container is
 *   gone. The consumer reimplements the chrome controls they want
 *   (import `<SearchTrigger>`, `<ThemeToggle>`, `<NotificationBell>`,
 *   `<RightSidebarTrigger>`, `<UserMenu>` from `@pilotiq/pilotiq/react`).
 * - `footer` — mounts a `<footer>` element BELOW the main content area
 *   in both layouts (outside the scroll region). Separate from the
 *   `panels::footer` render hook, which keeps firing inside the content
 *   area for per-page trailing chrome.
 *
 * The shape is open-ended so additional slots can land without a
 * breaking change when a concrete consumer asks for them.
 */
export interface ComponentSlots {
  /** Component rendered in place of the default nav tree. */
  nav?:    React.ComponentType<NavComponentProps>
  /** Component rendered in place of the default `<header>` chrome. */
  header?: React.ComponentType<HeaderComponentProps>
  /** Component rendered as the panel footer, below the main content. */
  footer?: React.ComponentType<FooterComponentProps>
}

export class Pilotiq {
  private config: PilotiqConfig
  private installedPlugins: PilotiqPlugin[] = []
  /** Lazy slug-indexed caches. Built on first lookup; invalidated when
   *  the underlying setter mutates the matching array. Resources /
   *  globals / pages are looked up by slug 16+ times per request across
   *  the page-data builders — the linear `Array.find` adds up around 50+
   *  resources. */
  private _resourceBySlug?: Map<string, ResourceClass>
  private _globalBySlug?:   Map<string, GlobalClass>
  private _pageBySlug?:     Map<string, typeof Page>
  /**
   * Per-user navigation badge cache. Keyed by `${ownerName}|${userKey}`
   * — `userKey` derived from `user.id` (or the primitive user / JSON
   * fallback / `''` for anon). Each entry expires after
   * `getNavigationBadgeTtl()` ms.
   */
  private _navigationBadgeCache: Map<string, { value: string | undefined; expires: number }> = new Map()

  private constructor(name: string) {
    this.config = {
      name,
      path: '/admin',
      layout: 'sidebar',
      resources: [],
      globals: [],
      pages: [],
      clusters: [],
      branding: {},
    }
  }

  static make(name: string): Pilotiq {
    return new Pilotiq(name)
  }

  path(p: string): this {
    this.config.path = `/${p.replace(/^\/+/, '')}`
    return this
  }

  branding(b: { title?: string; logo?: string }): this {
    this.config.branding = b
    return this
  }

  resources(r: ResourceClass[]): this {
    this.config.resources = r
    delete this._resourceBySlug
    return this
  }

  globals(g: GlobalClass[]): this {
    this.config.globals = g
    delete this._globalBySlug
    return this
  }

  pages(p: (typeof Page)[]): this {
    this.config.pages = p
    delete this._pageBySlug
    return this
  }

  clusters(c: ClusterClass[]): this {
    this.config.clusters = c
    return this
  }

  schema(def: SchemaDefinition): this {
    this.config.schema = def
    return this
  }

  /**
   * Plan #15 — mark a Page as the panel-root entry. Sugar for "render
   * this page's `schema()` at `${base}` instead of the default
   * dashboard layout."
   *
   * Effects:
   *   1. `GET ${base}` resolves the page's schema (instead of the
   *      builder-level `schema()` definition).
   *   2. The page is registered in `cfg.pages` if not already there
   *      (so canAccess + the action / form-state routes wire up).
   *   3. Navigation collapses the page's nav URL to `${base}` (no
   *      trailing slug segment) so the sidebar entry deep-links to
   *      the panel root.
   *
   * The page subclass is plain — no special Page subclass required.
   * The convention is `static slug = ''` so the regular slug-route
   * doesn't also catch it; `panel.dashboard()` enforces this by
   * skipping the page in the slug-route registration.
   *
   * @example
   *   class MyDashboard extends Page {
   *     static slug = ''
   *     static label = 'Dashboard'
   *     static schema() { return [Heading.make('Welcome')] }
   *   }
   *   panel.dashboard(MyDashboard)
   */
  dashboard(P: typeof Page): this {
    this.config.dashboardPage = P
    if (!this.config.pages.includes(P)) {
      this.config.pages = [...this.config.pages, P]
      delete this._pageBySlug
    }
    return this
  }

  /**
   * Mark a Page as the panel's profile page. The page is auto-added to
   * `cfg.pages` (routing + canAccess wired up) and the user-menu
   * dropdown prepends an "Edit profile" entry pointing at it.
   *
   *   class ProfilePage extends Page {
   *     static slug  = 'profile'
   *     static label = 'My profile'
   *     static icon  = 'user-circle'
   *     static schema(ctx) {
   *       return [Form.make().schema([TextField.make('name')…])]
   *     }
   *   }
   *   panel.profile(ProfilePage)
   */
  profile(P: typeof Page): this {
    this.config.profilePage = P
    if (!this.config.pages.includes(P)) {
      this.config.pages = [...this.config.pages, P]
      delete this._pageBySlug
    }
    return this
  }

  /**
   * Pick the panel layout, and (for `'sidebar'`) its chrome options.
   * The options are bound to the layout that uses them: passing a second
   * argument with `'topbar'` is a compile error, so sidebar-only config
   * can't silently no-op under a topbar panel.
   *
   * @example
   *   Pilotiq.make('Admin').layout('sidebar', { variant: 'floating', side: 'right' })
   *   Pilotiq.make('Admin').layout('topbar')
   */
  layout(l: 'sidebar', opts?: PilotiqSidebarOptions): this
  layout(l: PilotiqLayout): this
  layout(l: PilotiqLayout, opts?: PilotiqSidebarOptions): this {
    this.config.layout = l
    if (l === 'sidebar' && opts) this.config.sidebar = opts
    return this
  }

  theme(config: ThemeConfig): this {
    this.config.theme = config
    return this
  }

  guard(fn: (req: unknown) => boolean | Promise<boolean>): this {
    this.config.guard = fn
    return this
  }

  /**
   * Configure the current-user resolver. Pilotiq calls `fn(req)` once per
   * request and forwards the return value into every `Resource.canX(...)`,
   * `Global.canX(...)`, `Page.canAccess(...)`, and `Action.visible(({ user })
   * => ...)` callback. The user object is opaque to pilotiq.
   *
   * Apps using `@rudderjs/auth`:
   *
   *   import { Auth } from '@rudderjs/auth'
   *   Pilotiq.make('admin').user(() => Auth.user())
   *
   * Apps with custom auth pass whatever resolves their user. When unset,
   * `resolveUser` returns `null` and the default `can*` predicates (which
   * ignore `user`) all resolve `true`.
   */
  user(fn: UserResolver): this {
    this.config.user = fn
    return this
  }

  /**
   * Configure file uploads. Pass an adapter implementing
   * `UploadAdapter`; `localUpload({ root, urlPrefix })` is bundled for
   * disk-backed storage. Apps using S3 / R2 / a custom storage backend
   * provide their own adapter conforming to the same interface.
   *
   *   import { localUpload } from '@pilotiq/pilotiq/uploads'
   *   Pilotiq.make('admin').uploads({
   *     adapter: localUpload({ root: 'public/uploads', urlPrefix: '/uploads' })
   *   })
   */
  uploads(config: UploadConfig): this {
    this.config.uploads = config
    return this
  }

  /**
   * Register entries for the panel's top-right user-menu dropdown.
   * Replaces any previously registered set (call once with the full
   * list). The dropdown only mounts when `Pilotiq.user(req => …)` is
   * configured AND resolves a non-null user; otherwise the items are
   * silently ignored.
   *
   *   import { UserMenuItem } from '@pilotiq/pilotiq'
   *   Pilotiq.make('admin')
   *     .user(req => Auth.user())
   *     .userMenuItems([
   *       UserMenuItem.make('profile').label('My profile').url('/profile'),
   *       UserMenuItem.make('billing').label('Billing').url('/billing').sort(10),
   *     ])
   *     .signOut('/logout')
   */
  userMenuItems(items: UserMenuItem[]): this {
    this.config.userMenuItems = items
    return this
  }

  /**
   * Configure the sign-out entry on the user menu. Pass a string for the
   * default POST shape, or a `SignOutConfig` to override label/method.
   *
   *   .signOut('/logout')
   *   .signOut({ url: '/auth/logout', method: 'GET', label: 'Log out' })
   */
  signOut(config: string | SignOutConfig): this {
    this.config.signOut = typeof config === 'string' ? { url: config } : config
    return this
  }

  /**
   * Register a server-side hydrator that runs after the fill pipeline
   * on every resource edit page. Each registered hydrator's non-null
   * return merges onto the form's default values; multiple registrations
   * are walked in registration order (later wins on key conflicts).
   *
   *   panel.editPageHydrator(async ({ resource, recordId }) => {
   *     // override defaults for this record from your alt source
   *     return { title: await draftStore.read(resource.getSlug(), recordId) }
   *   })
   *
   * Plugins typically register from inside their `register(panel)` hook.
   * Throwing or returning `null` is a pass-through — the DB row values
   * survive. See `EditPageHydrator` for the full contract.
   */
  editPageHydrator(fn: EditPageHydrator): this {
    if (!this.config.editPageHydrators) this.config.editPageHydrators = []
    this.config.editPageHydrators.push(fn)
    return this
  }

  /**
   * Enable persistent database-backed notifications. Mounts the bell in
   * the panel chrome + a small set of `_notifications` endpoints. The
   * bell only renders when a non-null user resolves from
   * `Pilotiq.user(req => …)` — anonymous requests never see the
   * affordance.
   *
   * Sends originate from `Notification.make('Saved')
   * .sendToDatabase(user)` (and the rudder `Notifier.send(user, ...)` /
   * `notify(user, ...)` paths when the app uses the upstream
   * notification class). Both write to the same `notification` table so
   * the bell surfaces both.
   *
   *   Pilotiq.make('admin')
   *     .user(req => Auth.user())
   *     .databaseNotifications()                              // defaults
   *     .databaseNotifications({ position: 'sidebar' })       // bell in sidebar
   *     .databaseNotifications({ polling: null })             // disable polling
   *     .databaseNotifications({ polling: 10, pageSize: 50 }) // custom
   */
  databaseNotifications(opts: DatabaseNotificationsConfig = {}): this {
    this.config.databaseNotifications = { ...opts, enabled: true }
    return this
  }

  /**
   * Sugar setter for the polling interval. `null` disables auto-poll.
   * Has no effect unless `.databaseNotifications()` was called.
   */
  databaseNotificationsPolling(seconds: number | null): this {
    if (!this.config.databaseNotifications) return this
    this.config.databaseNotifications = {
      ...this.config.databaseNotifications,
      polling: seconds,
    }
    return this
  }

  /**
   * Sugar setter for the bell mount position. Has no effect unless
   * `.databaseNotifications()` was called.
   */
  databaseNotificationsPosition(position: 'topbar' | 'sidebar'): this {
    if (!this.config.databaseNotifications) return this
    this.config.databaseNotifications = {
      ...this.config.databaseNotifications,
      position,
    }
    return this
  }

  /**
   * Phase 2 — enable broadcast push for the bell. Requires
   * `@rudderjs/broadcast` to be installed and `BroadcastingProvider`
   * registered. Pass `{ wsUrl }` to override the WebSocket URL (default:
   * same-origin `/ws`). Has no effect unless `.databaseNotifications()`
   * was called.
   *
   *   .databaseNotifications().databaseNotificationsBroadcast()
   *   .databaseNotifications().databaseNotificationsBroadcast({ wsUrl: 'wss://…/ws' })
   */
  databaseNotificationsBroadcast(opts: boolean | { wsUrl?: string } = true): this {
    if (!this.config.databaseNotifications) return this
    this.config.databaseNotifications = {
      ...this.config.databaseNotifications,
      broadcast: opts,
    }
    return this
  }

  /**
   * Register named handlers for `Notification.actions([…])` slots.
   * Calling this twice merges — later registrations override earlier
   * keys.
   *
   *   panel.notificationHandlers({
   *     'archive-project': async (ctx) => {
   *       const { projectId } = ctx.payload as { projectId: number }
   *       await Project.update(projectId, { archivedAt: new Date() })
   *       return { notify: { title: 'Archived', type: 'success' } }
   *     },
   *   })
   *
   * Names must match `^[A-Za-z0-9_-]+$` (URL-safe — they ride in the
   * action endpoint path). Empty / whitespace / non-conforming keys
   * throw at registration time so a typo fails fast instead of 404ing
   * three days later when a user clicks the action on an old row.
   *
   * Closures registered here survive a `data` JSON round-trip (only
   * the name does — the closure stays in memory). For transient toasts
   * authored against the current page, `Action.handler(async ctx => …)`
   * still works inline — the registry is only required for persisted
   * actions.
   */
  notificationHandlers(map: Record<string, NotificationActionHandler>): this {
    const namePattern = /^[A-Za-z0-9_-]+$/
    for (const key of Object.keys(map)) {
      if (!namePattern.test(key)) {
        throw new Error(
          `[Pilotiq] notificationHandlers: handler name "${key}" contains characters ` +
          `outside [A-Za-z0-9_-]. Names ride in the action URL path; pick a URL-safe key.`,
        )
      }
    }
    this.config.notificationHandlers = {
      ...(this.config.notificationHandlers ?? {}),
      ...map,
    }
    return this
  }

  /** @internal — looked up by the notification-action route. */
  getNotificationHandler(name: string): NotificationActionHandler | undefined {
    return this.config.notificationHandlers?.[name]
  }

  /**
   * Register a render hook — a callback that returns `Element[]` to
   * mount at a named slot in the panel chrome or page renderers. Multiple
   * hooks against the same name run in registration order; their outputs
   * concatenate.
   *
   *   import { Alert } from '@pilotiq/pilotiq'
   *
   *   Pilotiq.make('admin')
   *     .renderHook('panels::topbar.start', ({ user }) => [
   *       Alert.make(`Hi, ${(user as any)?.name ?? 'there'}`).info(),
   *     ])
   *     .renderHook(
   *       'panels::resource.pages.list-records.table.before',
   *       () => [Heading.make('Bulk import')],
   *       { resource: ArticleResource },
   *     )
   *
   * Scope (optional) restricts the hook to a single resource / page /
   * global. Scope keys are OR'd within the object — passing
   * `{ resource: A, page: P }` fires when EITHER `A` OR `P` is the
   * active route's identifier.
   *
   * Throwing hooks fail closed: their slot's contribution drops; other
   * hooks at the same slot still ship.
   *
   * Plan + guide: docs/plans/render-hooks.md, docs/guide/render-hooks.md.
   */
  renderHook(name: RenderHookName, fn: RenderHookFn, scope?: RenderHookScope): this {
    if (!this.config.renderHooks) this.config.renderHooks = []
    const entry: RenderHookEntry = { name, fn }
    if (scope !== undefined) entry.scope = scope
    this.config.renderHooks.push(entry)
    return this
  }

  /**
   * Resolve the current user for a request. Internal helper called by
   * routes + `panelInfo()`. Returns `null` when the resolver is unset or
   * throws. Errors are swallowed deliberately — a failing user resolver
   * should fail closed (no user) rather than 500 the page.
   */
  async resolveUser(req?: unknown): Promise<unknown | null> {
    if (!this.config.user) return null
    try {
      const u = await this.config.user(req)
      return u ?? null
    } catch {
      return null
    }
  }

  use(plugin: PilotiqPlugin): this {
    this.installedPlugins.push(plugin)
    plugin.register(this)
    return this
  }

  /**
   * Register multiple plugins in a single call. Each plugin's `register()`
   * runs in array order — equivalent to chaining `.use(p)` per item.
   *
   * @example
   * ```ts
   * import { tiptap } from '@pilotiq/tiptap'
   * import { codeEditor } from '@pilotiq/codemirror'
   * import { recharts } from '@pilotiq/recharts'
   * import { json } from '@codemirror/lang-json'
   *
   * Pilotiq.make('Admin')
   *   .plugins([
   *     tiptap(),
   *     codeEditor({ languages: { json } }),
   *     recharts(),
   *   ])
   * ```
   */
  plugins(list: PilotiqPlugin[]): this {
    for (const plugin of list) this.use(plugin)
    return this
  }

  /**
   * Register a single right-sidebar contribution. Plugins surface chat
   * boxes, presence panels, document outlines, etc. through this — pilotiq
   * core ships the sidebar chrome (collapse / resize / tab strip / mobile
   * sheet); each contribution provides only its body component.
   *
   * @example
   * ```ts
   * Pilotiq.make('Admin').rightPanel({
   *   id:        'ai.chat',
   *   label:     'AI Assistant',
   *   icon:      'sparkles',
   *   render:    AiChatBody,
   *   defaultWidth: 360,
   * })
   * ```
   *
   * Adapter packages typically call this from inside their plugin's
   * `register(panel)` so consumers wire everything via `.plugins([…])`.
   *
   * @throws when `id` is missing/invalid, when `render` isn't a
   *         component, when `defaultWidth` is out of [240, 800], or when
   *         the same `id` was already registered.
   */
  rightPanel(contribution: RightPanelContribution): this {
    validateRightPanel(contribution)
    const existing = this.config.rightPanels ?? []
    const dup = findDuplicateRightPanelId(existing, contribution)
    if (dup) {
      throw new Error(
        `[Pilotiq] rightPanel: contribution id "${contribution.id}" is already ` +
        `registered. Each right-sidebar contribution must use a unique id.`,
      )
    }
    this.config.rightPanels = [...existing, contribution]
    return this
  }

  /**
   * Bulk variant of {@link rightPanel}. Registers each contribution in
   * array order; throws on the first invalid or duplicate id.
   *
   * @example
   * ```ts
   * Pilotiq.make('Admin').rightPanels([
   *   { id: 'ai.chat',  render: AiChatBody },
   *   { id: 'outline',  render: OutlineBody, defaultWidth: 280 },
   * ])
   * ```
   */
  rightPanels(list: RightPanelContribution[]): this {
    for (const c of list) this.rightPanel(c)
    return this
  }

  /** @internal — `panelInfo()` reads this to build `RightSidebarMeta`. */
  getRightPanels(): readonly RightPanelContribution[] {
    return this.config.rightPanels ?? []
  }

  /**
   * Register a component that wraps the panel's `<AppShell>` children at
   * the layout root. Plugins use this to mount React providers (AI chat
   * queue context, tenant theme switcher, feature-flag overlay, …) so
   * they're in scope for every page in the panel without consumers
   * having to manually wrap their `+Layout.tsx`.
   *
   * Adapter packages typically call this from inside their plugin's
   * `register(panel)` so consumers wire everything via `.plugins([…])`.
   *
   * Provider components receive `{ children, basePath? }` props.
   * Registration order is preservation order: the first registered
   * provider sits OUTERMOST (closest to the layout root); the last sits
   * INNERMOST (closest to the page tree). When two providers depend on
   * each other, register the producer first.
   *
   * @example
   * ```ts
   * // In a plugin's register(panel):
   * panel.layoutProvider(({ children, basePath }) =>
   *   <AiUiProvider panelPath={basePath}>{children}</AiUiProvider>
   * )
   * ```
   *
   * @throws when `provider` isn't a function (component).
   */
  layoutProvider(provider: LayoutProviderComponent): this {
    if (typeof provider !== 'function') {
      throw new Error(
        `[Pilotiq] layoutProvider: expected a React component, got ${typeof provider}.`,
      )
    }
    const existing = this.config.layoutProviders ?? []
    this.config.layoutProviders = [...existing, provider]
    return this
  }

  /**
   * Bulk variant of {@link layoutProvider}. Registers each provider in
   * array order.
   */
  layoutProviders(list: LayoutProviderComponent[]): this {
    for (const c of list) this.layoutProvider(c)
    return this
  }

  /** @internal — read by the Vite plugin's `_components.ts` emitter. */
  getLayoutProviders(): readonly LayoutProviderComponent[] {
    return this.config.layoutProviders ?? []
  }

  /**
   * Override one of pilotiq's built-in chrome slots with a custom React
   * component. Calling twice merges — the latest registration wins per
   * slot; unset keys preserve the prior value (so a plugin can override
   * `nav` without clearing a host app's `footer`).
   *
   * Three slots ship today: `nav` (replaces the default nav tree),
   * `header` (replaces the whole `<header>` chrome bar in both
   * layouts — in `TopbarLayout` this subsumes the nav), and `footer`
   * (mounts a `<footer>` below the main content area in both layouts).
   * See {@link ComponentSlots} for the per-slot semantics and which
   * render hooks compose vs. stop firing under each replacement.
   *
   * Component refs are harvested by the Vite plugin into
   * `pages/(pilotiq)/_components.ts` — they never travel over the wire,
   * so authoring inside the panel module (which is import-safe on both
   * server and client) is the supported entry point.
   *
   * @example
   * ```ts
   * import { MyCustomSidebar } from './MyCustomSidebar.js'
   *
   * Pilotiq.make('Admin').components({ nav: MyCustomSidebar })
   * ```
   *
   * The supplied component receives `{ navigation, basePath, currentPath }`
   * — the same shape `panelInfo()` produces for the default renderers.
   * Import `NavComponentProps` and `isNavItemActive` from
   * `@pilotiq/pilotiq/react` to author a typed component that reuses
   * the framework's longest-prefix active-link semantics.
   */
  components(slots: ComponentSlots): this {
    this.config.components = { ...(this.config.components ?? {}), ...slots }
    return this
  }

  /** @internal — read by the Vite plugin's `_components.ts` emitter. */
  getComponentSlots(): Readonly<ComponentSlots> {
    return this.config.components ?? {}
  }

  /**
   * Set the panel-wide AI suggestion mode.
   *
   * - `'auto'` (default) — agent writes apply immediately.
   * - `'review'` — agent writes stage as `PendingSuggestion`s; the user
   *   approves/rejects via inline diff (text) or value-comparison panel
   *   (non-text). Reuses the Phase 8.5 applier registry on approve.
   *
   * Plan: `docs/plans/ai-review-mode.md`.
   */
  aiSuggestionsMode(mode: 'auto' | 'review'): this {
    this.config.aiSuggestionsMode = mode
    return this
  }

  /** @internal — read by `panelInfo()` and stamped onto the wire shape so
   *  the AI client tool knows which branch (apply vs queue) to take. */
  getAiSuggestionsMode(): 'auto' | 'review' {
    return this.config.aiSuggestionsMode ?? 'auto'
  }

  /** @internal */
  enableThemeEditor(): void {
    this.config.themeEditor = true
  }

  /** @internal — assign the storage adapter resolved by the
   *  `themeEditor({ storage })` plugin OR by the service provider's
   *  back-compat Prisma fallback. Both writers funnel through this
   *  setter so the route handlers consume a single slot. */
  _setThemeStorage(adapter: ThemeStorageAdapter | undefined): void {
    if (adapter === undefined) {
      delete this.config.themeStorage
    } else {
      this.config.themeStorage = adapter
    }
  }

  /** @internal — the active theme storage adapter (explicit or the
   *  boot-time Prisma fallback). Routes read from here. */
  getThemeStorage(): ThemeStorageAdapter | undefined {
    return this.config.themeStorage
  }

  /** @internal */
  setThemeOverrides(overrides: Partial<ThemeConfig> | undefined): void {
    if (overrides === undefined) {
      delete this.config._themeOverrides
    } else {
      this.config._themeOverrides = overrides
    }
  }

  /** @internal — returns code defaults merged with DB overrides. Returns an
   *  empty config when the theme editor is on so the built-in default preset
   *  still resolves and the editor can persist overrides on top. */
  getMergedTheme(): ThemeConfig | undefined {
    const base = this.config.theme
    const overrides = this.config._themeOverrides
    if (!base && !overrides && !this.config.themeEditor) return undefined
    return { ...base, ...overrides }
  }

  /**
   * Slug-indexed lookup for resources. O(1) replacement for
   * `cfg.resources.find(r => r.getSlug() === slug)`. Built lazily on
   * first call; invalidated when `.resources([…])` is reassigned.
   */
  findResource(slug: string): ResourceClass | undefined {
    if (!this._resourceBySlug) {
      this._resourceBySlug = new Map(this.config.resources.map(r => [r.getSlug(), r]))
    }
    return this._resourceBySlug.get(slug)
  }

  /** Slug-indexed lookup for globals. See `findResource`. */
  findGlobal(slug: string): GlobalClass | undefined {
    if (!this._globalBySlug) {
      this._globalBySlug = new Map(this.config.globals.map(g => [g.getSlug(), g]))
    }
    return this._globalBySlug.get(slug)
  }

  /** Slug-indexed lookup for pages. See `findResource`. */
  findPage(slug: string): typeof Page | undefined {
    if (!this._pageBySlug) {
      this._pageBySlug = new Map(this.config.pages.map(p => [p.getSlug(), p]))
    }
    return this._pageBySlug.get(slug)
  }

  /**
   * TTL (milliseconds) for the per-user navigation badge cache. Badges
   * resolve once per `(owner, userIdentity)` pair and serve from the
   * in-memory cache until the TTL elapses; the cache covers the
   * common case where a panel with N resources each running
   * `Model.count()` for a sidebar badge would otherwise issue N queries
   * on every page nav.
   *
   * Pass `0` (or `null`) to disable caching entirely. Default 30000.
   */
  navigationBadgeTtl(ms: number | null): this {
    if (ms === null) {
      delete this.config.navigationBadgeTtlMs
    } else {
      this.config.navigationBadgeTtlMs = Math.max(0, ms)
    }
    // Bust on reconfigure so the new TTL doesn't reuse stale slots.
    this._navigationBadgeCache.clear()
    return this
  }

  /** @internal — resolved TTL in milliseconds. Default 30s. `0`
   *  disables caching (each request re-resolves). */
  getNavigationBadgeTtl(): number {
    return this.config.navigationBadgeTtlMs ?? 30_000
  }

  /** @internal — cache key for one (owner, user) pair. */
  navigationBadgeCacheKey(ownerName: string, user: unknown): string {
    return `${ownerName}|${userIdentityKey(user)}`
  }

  /** @internal — read-through cache for a single owner's badge value.
   *  Caller supplies the resolver; cache wraps it with the configured
   *  TTL. When TTL is 0 the resolver is invoked unconditionally and
   *  nothing is stored. */
  async resolveNavigationBadge(
    ownerName: string,
    user:      unknown,
    resolver:  () => Promise<string | undefined>,
  ): Promise<string | undefined> {
    const ttl = this.getNavigationBadgeTtl()
    if (ttl <= 0) return resolver()

    const key = this.navigationBadgeCacheKey(ownerName, user)
    const now = Date.now()
    const hit = this._navigationBadgeCache.get(key)
    if (hit && hit.expires > now) return hit.value

    const value = await resolver()
    this._navigationBadgeCache.set(key, { value, expires: now + ttl })
    return value
  }

  /** @internal — test seam; clears the per-user badge cache. */
  _clearNavigationBadgeCache(): void {
    this._navigationBadgeCache.clear()
  }

  /** @internal */
  getConfig(): Readonly<PilotiqConfig> {
    return this.config
  }

  /** @internal */
  getPlugins(): readonly PilotiqPlugin[] {
    return this.installedPlugins
  }
}

/**
 * Stable cache key derived from a user object. Pilotiq treats the user
 * as opaque, so we sniff the common shapes:
 *
 * 1. `null` / `undefined` — anonymous request; everyone shares one slot.
 * 2. Primitive (string / number / bigint / boolean) — stringify directly.
 * 3. Object with `id` — `String(user.id)` (the 99% case for app-supplied users).
 * 4. Other objects — `JSON.stringify` as a last resort; falls back to a
 *    sentinel if stringify throws (cycles).
 *
 * Two distinct users with the same `id` collide, but that's the same
 * collision the rest of the framework already trusts.
 */
function userIdentityKey(user: unknown): string {
  if (user === null || user === undefined) return ''
  const t = typeof user
  if (t === 'string' || t === 'number' || t === 'bigint' || t === 'boolean') return String(user)
  if (t === 'object') {
    const u = user as { id?: unknown }
    if (u.id !== undefined && u.id !== null) return String(u.id)
    try { return JSON.stringify(user) } catch { return '__opaque__' }
  }
  return '__opaque__'
}
