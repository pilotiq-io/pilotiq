import type { Resource } from './Resource.js'
import type { Page } from './Page.js'
import type { SchemaDefinition } from './schema/resolveSchema.js'
import type { ThemeConfig } from './theme/types.js'

export type PilotiqLayout = 'sidebar' | 'topbar'

export interface PilotiqConfig {
  name:       string
  path:       string
  layout:     PilotiqLayout
  resources:  Resource[]
  pages:      (typeof Page)[]
  branding:   { title?: string; logo?: string }
  schema?:    SchemaDefinition
  theme?:     ThemeConfig
  guard?:     (req: unknown) => boolean | Promise<boolean>
}

export class Pilotiq {
  private config: PilotiqConfig

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

  /** @internal */
  getConfig(): Readonly<PilotiqConfig> {
    return this.config
  }
}
