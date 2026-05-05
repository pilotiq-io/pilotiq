import type { Element } from './schema/Element.js'
import type { SchemaContext, SchemaDefinition } from './schema/resolveSchema.js'
import type { ResourceClass, NavigationBadgeColor, NavigationBadgeHandler } from './Resource.js'
import type { ClusterClass } from './Cluster.js'
import { type IconValue, serializeIcon } from './icons/types.js'

/**
 * Discriminator the framework uses for default rendering, route generation,
 * and breadcrumbs. `'custom'` is for standalone Pages that don't belong to
 * a Resource. The other modes correspond to the four resource page roles.
 */
export type PageMode = 'list' | 'create' | 'edit' | 'view' | 'custom'

export interface PageMeta {
  slug:  string
  label: string
  /** Serialized: string registry key, `{ class }` manifest reference, or undefined. */
  icon:  string | { class: string } | undefined
  mode:  PageMode
}

export class Page {
  /** URL slug (e.g. 'analytics'). Derived from class name if not set. */
  static slug?: string

  /** Sidebar label (e.g. 'Analytics'). Derived from class name if not set. */
  static label?: string

  /** Optional sidebar icon. Either a kebab-case name resolved through
   * `registerIcons()` (e.g., `'newspaper'`), or a React component
   * reference (e.g., `import { Newspaper } from 'lucide-react'`).
   * Component refs serialize via the build-time `_components.ts`
   * manifest emitted by the Pilotiq Vite plugin. */
  static icon?: IconValue

  // ─── Plan #9: navigation metadata ──────────────────────────
  // Mirrors Resource's nav fields (minus `recordTitleAttribute`).
  static navigationGroup:       string | undefined = undefined
  static navigationSort:        number | undefined = undefined
  static navigationLabel:       string | undefined = undefined
  static navigationIcon:        IconValue          = undefined
  static navigationBadge:       NavigationBadgeHandler | undefined = undefined
  static navigationBadgeColor:  NavigationBadgeColor = 'default'
  static navigationParentItem:  string | undefined = undefined

  /**
   * Cluster this page belongs to. When set, the page's URL gains the
   * cluster's slug as a prefix segment and the page nests under the
   * cluster's nav entry. The referenced class must be registered via
   * `Pilotiq.clusters([…])`.
   */
  static cluster?: ClusterClass

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

  /** Sidebar label: `navigationLabel` override falls through to `getLabel()`. */
  static getNavigationLabel(): string {
    return this.navigationLabel ?? this.getLabel()
  }

  /** Sidebar icon: `navigationIcon` override falls through to `icon`. */
  static getNavigationIcon(): IconValue {
    return this.navigationIcon ?? this.icon
  }

  static hasSchema(): boolean {
    return this._schemaDef !== undefined || this.schema !== Page.schema
  }

  /** Plan #10: authorization. Custom pages get a single `canAccess` gate
   * (no per-record predicates — pages are too freeform to assume a
   * record concept). Resource-bound default page subclasses can still
   * read their owning resource's predicates via `getResource()`. */
  static async canAccess(_user: unknown): Promise<boolean> { return true }

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
    // Serialize via the icon-system helper so component-typed icons
    // ship as `{ class: <name> }` rather than the raw forwardRef
    // object — viewProps must be JSON-serializable.
    return {
      slug:  this.getSlug(),
      label: this.getLabel(),
      icon:  serializeIcon(this.icon, this.name),
      mode:  this.getMode(),
    }
  }
}
