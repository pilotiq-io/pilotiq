import type { Resource } from './Resource.js'

export interface PilotiqConfig {
  name:       string
  path:       string
  resources:  Resource[]
  branding:   { title?: string; logo?: string }
  guard?:     (req: unknown) => boolean | Promise<boolean>
}

export class Pilotiq {
  private config: PilotiqConfig

  private constructor(name: string) {
    this.config = {
      name,
      path: '/admin',
      resources: [],
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

  guard(fn: (req: unknown) => boolean | Promise<boolean>): this {
    this.config.guard = fn
    return this
  }

  /** @internal */
  getConfig(): Readonly<PilotiqConfig> {
    return this.config
  }
}
