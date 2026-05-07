import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { ClusterClass } from './Cluster.js'
import type { Page } from './Page.js'
import type { SchemaDefinition } from './schema/resolveSchema.js'
import type { ThemeConfig } from './theme/types.js'
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

export type PilotiqLayout = 'sidebar' | 'topbar'

/** Plugin interface for extending Pilotiq panels. */
export interface PilotiqPlugin {
  name: string
  /** Called when .use() is invoked — mutate config as needed. */
  register(panel: Pilotiq): void
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
  /** @internal Runtime theme overrides from DB. */
  _themeOverrides?: Partial<ThemeConfig>
}

export class Pilotiq {
  private config: PilotiqConfig
  private installedPlugins: PilotiqPlugin[] = []

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
    return this
  }

  globals(g: GlobalClass[]): this {
    this.config.globals = g
    return this
  }

  pages(p: (typeof Page)[]): this {
    this.config.pages = p
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
    }
    return this
  }

  layout(l: PilotiqLayout): this {
    this.config.layout = l
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
   * disk-backed storage. Apps using S3 / R2 / `@pilotiq/media` provide
   * their own adapter conforming to the same interface.
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

  /** @internal */
  enableThemeEditor(): void {
    this.config.themeEditor = true
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

  /** @internal */
  getConfig(): Readonly<PilotiqConfig> {
    return this.config
  }

  /** @internal */
  getPlugins(): readonly PilotiqPlugin[] {
    return this.installedPlugins
  }
}
