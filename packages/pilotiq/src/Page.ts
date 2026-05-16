import type { Element } from './schema/Element.js'
import type { SchemaContext, SchemaDefinition } from './schema/resolveSchema.js'
import type { ResourceClass, NavigationBadgeColor, NavigationBadgeHandler } from './Resource.js'
import type { ClusterClass } from './Cluster.js'
import { type IconValue, serializeIcon } from './icons/types.js'

/**
 * Per-custom-page collab configuration. Custom pages have no record id
 * to derive a room from, so `room` is required and must be supplied as
 * a literal string (e.g. `'team-settings'`). The plugin reads this off
 * the panel-level `pageCollab` map and uses it to seed the page's
 * Y.Doc.
 *
 *   room     — literal room identifier; namespaced internally so two
 *              pages with the same `room` literal collide deliberately.
 *   presence — when false, suppress the awareness layer (focus chips,
 *              cursor positions) while keeping value-sync. Defaults to true.
 *
 * Field-level `.collab(false)` always wins per field. Resource-bound
 * default pages (List/Create/Edit/View) ignore this — record-scoped
 * collab is governed by `Resource.collab`.
 */
export interface PageCollabConfig {
  room:     string
  presence: boolean
}

/** Raw shape accepted by `static collab` before normalization. Unlike
 * `Resource.collab` there is no `true` shorthand — `room` is required. */
export type PageCollabInput = {
  room:      string
  presence?: boolean
}

/**
 * Discriminator the framework uses for default rendering, route generation,
 * and breadcrumbs. `'custom'` is for standalone Pages that don't belong to
 * a Resource. `'record'` is for record-scoped sub-pages declared under a
 * Resource's `pages().record` map. The other four modes correspond to the
 * standard resource page roles.
 */
export type PageMode = 'list' | 'create' | 'edit' | 'view' | 'record' | 'custom'

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

  // ─── Realtime collab opt-in ────────────────────────────────
  // Per-page opt-in for custom Pages. Resource-bound default pages
  // (List/Create/Edit/View) ignore this — record-scoped collab is
  // governed by `Resource.collab`. Set on a custom Page subclass to
  // mount the plugin-registered custom-page wrapper around its content
  // area at runtime.

  /** Enable collab on this custom page. `room` is required (no recordId
   * to derive one from). Omitting `static collab` keeps the page
   * collab-free even when the `@pilotiq-pro/collab` plugin is installed. */
  static collab: PageCollabInput | null = null

  /**
   * Normalize `static collab` into the canonical wire shape, or return
   * `null` when the page has not opted in. Centralizes the `presence`
   * default. Resource-bound default pages always return `null` here —
   * use `Resource.collab` for those.
   *
   * Result lands on `panelInfo().pageCollab[slug]`; the gate reads it to
   * decide whether to mount the custom-page wrapper.
   */
  static getResolvedCollabConfig(): PageCollabConfig | null {
    if (this.getMode() !== 'custom') return null
    const raw = this.collab
    if (raw === null || raw === undefined) return null
    if (typeof raw.room !== 'string' || raw.room.length === 0) return null
    return {
      room:     raw.room,
      presence: raw.presence ?? true,
    }
  }

  /** Plan #10: authorization. Custom pages get a single `canAccess` gate
   * (no per-record predicates — pages are too freeform to assume a
   * record concept). Resource-bound default page subclasses can still
   * read their owning resource's predicates via `getResource()`.
   *
   * Record sub-pages (declared under `ResourcePages.record`) receive
   * the loaded parent record as the second argument so subclasses can
   * gate on record state in addition to user. The parameter is
   * optional so existing custom-page subclasses with `canAccess(user)`
   * keep type-checking. Record-aware sub-pages typically override as
   * `canAccess(user, record)`. */
  static async canAccess(_user: unknown, _record?: unknown): Promise<boolean> { return true }

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
