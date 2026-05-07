import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import type { Page } from './Page.js'
import type { IconValue } from './icons/types.js'
import type { NavigationBadgeColor, NavigationBadgeHandler } from './Resource.js'
import type { ClusterClass } from './Cluster.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'
import { defaultGlobalPages } from './defaultGlobalPages.js'

/**
 * Map of global page roles. Globals are singletons — they have no list or
 * create page; users typically only need `edit`. `view` is supported as an
 * opt-in for read-only audiences.
 */
export interface GlobalPages {
  edit?: typeof Page
  view?: typeof Page
}

/**
 * A `Global` is a singleton resource — one record, no list/create/delete.
 * Useful for site settings, brand config, on-call rotation, etc.
 *
 * Reuses the same Form-as-Element machinery as `Resource`: configure fields
 * + lifecycle (loadRecord / save / fillFromRecord) on the Form returned
 * from `form()`. The framework loads the singleton on GET, runs the
 * dispatch lifecycle on POST, and 303-redirects back to the same URL on
 * success.
 *
 * Routes:
 *   GET  ${base}/${slug}        → edit page (form pre-filled from loadRecord)
 *   POST ${base}/${slug}        → run save lifecycle
 *
 * The Form's `loadRecord` is called with an empty string id — singletons
 * ignore the id parameter. `save()` is responsible for upsert semantics.
 */
export abstract class Global {
  /** Human-readable label, e.g. `'Site Settings'`. Same value for plural/singular. */
  static label: string         = 'Global'

  /** Singular label (used in titles). Defaults to `label` when not set. */
  static labelSingular: string = 'Global'

  /** URL slug. Derived from `label` when unset. */
  static slug: string = ''

  /** Sidebar / nav icon. String registry key or React component. See
   * `Resource.icon` for the contract. */
  static icon: IconValue = 'settings'

  // ─── Plan #9: navigation metadata ──────────────────────────
  // Same shape as Resource minus `recordTitleAttribute` (singletons
  // don't surface as record references). Default `navigationGroup`
  // is `'Settings'` — most users want all globals grouped under that
  // header. Override with `null` (or any other string) to opt out.

  /** Group label. Defaults to `'Settings'`; set to `null` to opt out
   * and render at the top level. */
  static navigationGroup: string | null | undefined = 'Settings'

  /** Sort key within a group. */
  static navigationSort: number | undefined = undefined

  /** Sidebar label override. */
  static navigationLabel: string | undefined = undefined

  /** Sidebar icon override. */
  static navigationIcon: IconValue = undefined

  /** Server-eval'd badge handler. */
  static navigationBadge: NavigationBadgeHandler | undefined = undefined

  /** Pill color for the badge. */
  static navigationBadgeColor: NavigationBadgeColor = 'default'

  /** Class name of a parent nav item. */
  static navigationParentItem: string | undefined = undefined

  /**
   * Cluster this global belongs to. When set, the global's URL gains the
   * cluster's slug as a prefix segment (e.g. `/admin/settings/branding`
   * instead of `/admin/branding`) and the global nests under the
   * cluster's nav entry. The referenced class must be registered via
   * `Pilotiq.clusters([…])`.
   */
  static cluster?: ClusterClass

  /**
   * Optional `ModelLike` binding. When set, the framework auto-wires
   * the edit page's `Form.loadRecord` (loads the singular record via
   * `loadSingularRecord(M)`) and `Form.save` (upserts via `modelSave(M)`
   * — `M.update(pk, data)` when a record exists, `M.create(data)` on
   * first save). Mirrors the reference admin's "singular resource"
   * pattern — one record auto-creates on first submission.
   *
   * Hand-wiring `Form.loadRecord` / `Form.save` inside `form()` still
   * wins; the auto-wire only fills the slot when the user didn't.
   */
  static model?: ModelLike

  /**
   * Strategy for finding the single record when `static model` is set.
   * Default: `paginate(1, 1)` (the first row). Override to pin a
   * specific lookup, e.g.
   *
   *   static findSingular = (q) => q.where('id', '=', 1)
   *   static findSingular = (q) => q.where('key', '=', 'brand')
   *
   * Returns `null` when no match exists — `modelSave` will then run
   * `M.create(data)` on first POST.
   */
  static findSingular?: (q: ModelQuery) => ModelQuery

  // ─── Plan #10: authorization predicates ────────────────────
  // Subset of `Resource`'s predicates — globals have no list / create /
  // delete, so they only carry `canAccess` + `canView` + `canEdit`.

  /** Coarse "should this global exist for this user at all" gate.
   * Failing `canAccess` drops the global from the nav tree and 403s
   * the edit/view routes. */
  static async canAccess(_user: unknown): Promise<boolean> { return true }

  /** Allowed to load the optional read-only view page. */
  static async canView(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /** Allowed to load and submit the edit page. */
  static async canEdit(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /**
   * Configure the form used by the edit page. Receives a fresh `Form`
   * instance; return the configured form. Wire `loadRecord` (no id needed)
   * and `save` (upsert) on the Form to make the singleton round-trip.
   */
  static form(form: Form): Form { return form }

  /** Schema for an optional read-only `view` page. */
  static detail(_record: unknown): Element[] { return [] }

  /**
   * User-overridable page map. Default is `{ edit }` (no view); override
   * to add a view page or replace the edit page.
   */
  static pages(): GlobalPages { return {} }

  /** Resolved page map: defaults overlaid with whatever `pages()` returns. */
  static resolvePages(): GlobalPages {
    const defaults  = defaultGlobalPages(this as unknown as GlobalClass)
    const overrides = this.pages()
    return { ...defaults, ...overrides }
  }

  /** URL slug, derived from `label` when not set explicitly. */
  static getSlug(): string {
    return this.slug || this.label.toLowerCase().replace(/\s+/g, '-')
  }

  /** Sidebar label: `navigationLabel` override falls through to `label`. */
  static getNavigationLabel(): string {
    return this.navigationLabel ?? this.label
  }

  /** Sidebar icon: `navigationIcon` override falls through to `icon`. */
  static getNavigationIcon(): IconValue {
    return this.navigationIcon ?? this.icon
  }
}

/** Constructor type for `Global` subclasses. Used in panel registration. */
export type GlobalClass = typeof Global
