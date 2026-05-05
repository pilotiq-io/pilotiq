import type { IconValue } from './icons/types.js'
import type { NavigationBadgeColor, NavigationBadgeHandler } from './Resource.js'
import type { Page } from './Page.js'

/**
 * URL-prefix container that groups Resources, Globals, and custom Pages
 * under a shared slug and a single sidebar entry. Children opt in via
 * `static cluster = MyCluster`.
 */
export abstract class Cluster {
  /** Human-readable label for the cluster nav entry, e.g. `'Content'`. */
  static label: string = 'Cluster'

  /** URL slug. Derived from `label` when unset. */
  static slug: string = ''

  /** Sidebar / nav icon. String registry key or React component. See
   * `Resource.icon` for the contract. */
  static icon: IconValue = 'folder'

  // ─── Navigation metadata ──────────────────────────
  // Mirrors Resource's nav surface so clusters compose with
  // `navigationGroup` (a Settings cluster sitting under a 'System'
  // group, etc.) and `navigationParentItem` (a sub-cluster under a
  // parent nav item).

  /** Group label this cluster renders under in the sidebar. */
  static navigationGroup: string | undefined = undefined

  /** Sort key within a group. Lower sorts first. */
  static navigationSort: number | undefined = undefined

  /** Sidebar label override. `Cluster.label` still drives URL paths. */
  static navigationLabel: string | undefined = undefined

  /** Sidebar icon override. */
  static navigationIcon: IconValue = undefined

  /** Server-eval'd badge handler; rendered as a small pill next to the
   * cluster label. Errors are swallowed by `panelInfo()` so a flaky
   * count never blanks the page. The cluster's badge does NOT aggregate
   * its children's badges — it's an independent handler. */
  static navigationBadge: NavigationBadgeHandler | undefined = undefined

  /** Pill color for the badge. */
  static navigationBadgeColor: NavigationBadgeColor = 'default'

  /** Class name of a parent nav item. */
  static navigationParentItem: string | undefined = undefined

  /**
   * Optional landing page when the cluster nav entry is clicked. Must be
   * a Page registered in `cfg.pages` whose `static cluster` points at
   * this cluster. When unset, the cluster nav URL deep-links to the
   * first accessible child (resource list / global edit / custom page).
   */
  static landingPage?: typeof Page

  /**
   * Coarse "should this cluster exist for this user" gate. Failing
   * `canAccess` drops the cluster + every child from the nav tree and
   * 403s every child route. Throws are treated as `false` (fail closed).
   */
  static async canAccess(_user: unknown): Promise<boolean> { return true }

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

/** Constructor type for `Cluster` subclasses. Used in panel registration. */
export type ClusterClass = typeof Cluster
