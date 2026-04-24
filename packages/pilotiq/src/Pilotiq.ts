import type { Resource } from './Resource.js'
import type { Page } from './Page.js'
import type { SchemaDefinition } from './schema/resolveSchema.js'
import type { ThemeConfig } from './theme/types.js'

export type PilotiqLayout = 'sidebar' | 'topbar'

/** Plugin interface for extending Pilotiq panels. */
export interface PilotiqPlugin {
  name: string
  /** Called when .use() is invoked — mutate config as needed. */
  register(panel: Pilotiq): void
}

export interface PilotiqConfig {
  name:          string
  path:          string
  layout:        PilotiqLayout
  resources:     Resource[]
  pages:         (typeof Page)[]
  branding:      { title?: string; logo?: string }
  schema?:       SchemaDefinition
  theme?:        ThemeConfig
  themeEditor?:  boolean
  guard?:        (req: unknown) => boolean | Promise<boolean>
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

  resources(r: Resource[]): this {
    this.config.resources = r
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
