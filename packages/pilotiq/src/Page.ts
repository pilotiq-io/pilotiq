import type { Element } from './schema/Element.js'
import type { SchemaContext, SchemaDefinition } from './schema/resolveSchema.js'
import type { ResourceClass } from './Resource.js'

/**
 * Discriminator the framework uses for default rendering, route generation,
 * and breadcrumbs. `'custom'` is for standalone Pages that don't belong to
 * a Resource. The other modes correspond to the four resource page roles.
 */
export type PageMode = 'list' | 'create' | 'edit' | 'view' | 'custom'

export interface PageMeta {
  slug:  string
  label: string
  icon:  string | undefined
  mode:  PageMode
}

export class Page {
  /** URL slug (e.g. 'analytics'). Derived from class name if not set. */
  static slug?: string

  /** Sidebar label (e.g. 'Analytics'). Derived from class name if not set. */
  static label?: string

  /** Optional icon string shown in the sidebar. */
  static icon?: string

  /** Stored schema definition. */
  protected static _schemaDef?: SchemaDefinition

  /**
   * Define the page content using a stored schema definition.
   *
   * @example
   * static {
   *   this.define(async (ctx) => [
   *     Heading.make('Analytics'),
   *   ])
   * }
   */
  static define(def: SchemaDefinition): typeof Page {
    this._schemaDef = def
    return this
  }

  /**
   * Return the page's schema elements.
   * Override this method for full control, or use define() for inline definitions.
   */
  static schema(_ctx?: SchemaContext): Element[] | Promise<Element[]> {
    if (!this._schemaDef) return []
    return typeof this._schemaDef === 'function'
      ? this._schemaDef(_ctx ?? {})
      : this._schemaDef
  }

  static getSlug(): string {
    if (this.slug) return this.slug
    return this.name.replace(/Page$/, '').toLowerCase()
  }

  static getLabel(): string {
    if (this.label) return this.label
    const name = this.name.replace(/Page$/, '')
    return name.replace(/([A-Z])/g, ' $1').trim()
  }

  static hasSchema(): boolean {
    return this._schemaDef !== undefined || this.schema !== Page.schema
  }

  /**
   * Optional back-reference to the owning Resource. Auto-generated default
   * pages set this; user subclasses may override for breadcrumb / title
   * resolution. Standalone custom pages return undefined.
   */
  static getResource(): ResourceClass | undefined { return undefined }

  /**
   * Mode discriminator. Default `'custom'` (standalone page). Resource-bound
   * pages override to one of `'list' | 'create' | 'edit' | 'view'`.
   */
  static getMode(): PageMode { return 'custom' }

  /** @internal */
  static toMeta(): PageMeta {
    return {
      slug:  this.getSlug(),
      label: this.getLabel(),
      icon:  this.icon,
      mode:  this.getMode(),
    }
  }
}
