import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { Page } from './Page.js'
import type { SchemaDefinition } from './schema/resolveSchema.js'
import type { ThemeConfig } from './theme/types.js'
import type { UploadAdapter } from './uploads/UploadAdapter.js'

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

export interface PilotiqConfig {
  name:          string
  path:          string
  layout:        PilotiqLayout
  resources:     ResourceClass[]
  globals:       GlobalClass[]
  pages:         (typeof Page)[]
  branding:      { title?: string; logo?: string }
  schema?:       SchemaDefinition
  theme?:        ThemeConfig
  themeEditor?:  boolean
  guard?:        (req: unknown) => boolean | Promise<boolean>
  user?:         UserResolver
  uploads?:      UploadConfig
  /** @internal Runtime theme overrides from DB. */
  _themeOverrides?: Partial<ThemeConfig>
}

export class Pilotiq {
  private config: PilotiqConfig
  private plugins: PilotiqPlugin[] = []

  private constructor(name: string) {
    this.config = {
      name,
      path: '/admin',
      layout: 'sidebar',
      resources: [],
      globals: [],
      pages: [],
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

  schema(def: SchemaDefinition): this {
    this.config.schema = def
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
    this.plugins.push(plugin)
    plugin.register(this)
    return this
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
    return this.plugins
  }
}
