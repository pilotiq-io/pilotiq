import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import type { Table } from './elements/Table.js'
import type { Page } from './Page.js'
import type { ModelLike } from './orm/modelDefaults.js'
import type { IconValue } from './icons/types.js'
import { defaultPages } from './defaultPages.js'

/** Map of resource page roles to Page subclasses. */
export interface ResourcePages {
  index?:  typeof Page
  create?: typeof Page
  edit?:   typeof Page
  view?:   typeof Page
}

/** Placeholder until Phase 3+ relations work lands. */
export type RelationDef = unknown

/** Pill color tokens for `navigationBadgeColor`. Matches the shared color
 * palette used by `ListTab.badgeColor` so the renderer can re-use the
 * same Tailwind utility map. */
export type NavigationBadgeColor =
  | 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

/** Returned by `navigationBadge`: a string/number to render as a pill,
 * or undefined to render no pill. May be async. Errors thrown from this
 * handler are swallowed by `panelInfo()` so a flaky count never blanks
 * the page. */
export type NavigationBadgeHandler =
  () => string | number | undefined | Promise<string | number | undefined>

/**
 * Abstract Resource base class. **All methods are static** — resources are
 * registered by class, not by instance. Routes look up the class and call
 * statics directly.
 *
 * Subclasses override `form()`, `table()`, `detail()`, and `pages()` to
 * shape the resource. Defaults make the most-common case (CRUD with a
 * form + a table) work with minimal boilerplate; 2.2 will fill in
 * auto-generated default Page classes.
 */
export abstract class Resource {
  /** Human-readable plural label, e.g. `'Articles'`. */
  static label: string = 'Resources'

  /** Singular label, e.g. `'Article'`. */
  static labelSingular: string = 'Resource'

  /** URL slug. Derived from `label` when unset. */
  static slug: string = ''

  /** Sidebar / nav icon. Either a kebab-case registry name (e.g.,
   * `'file'`) or a React component reference imported from any icon
   * library (e.g., `import { Newspaper } from 'lucide-react'`).
   * See `@pilotiq/pilotiq/icons` for the registry; component refs
   * resolve via the Vite-plugin `_components.ts` manifest. */
  static icon: IconValue = 'file'

  // ─── Plan #9: navigation metadata ──────────────────────────
  // Static fields evaluated once at panel-config time; only
  // `navigationBadge` runs per request. See docs/plans/resource-navigation.md.

  /** Group label this resource renders under in the sidebar. Items
   * without a group land in an unnamed top section. */
  static navigationGroup: string | undefined = undefined

  /** Sort key within a group. Lower sorts first; ties fall back to
   * registration order. Items without a sort go after sorted items. */
  static navigationSort: number | undefined = undefined

  /** Sidebar label override. `Resource.label` still drives page titles. */
  static navigationLabel: string | undefined = undefined

  /** Sidebar icon override. Same `IconValue` contract as `icon`. */
  static navigationIcon: IconValue = undefined

  /** Server-eval'd badge handler; rendered as a small pill next to the
   * label. Errors thrown here are swallowed so a broken count never
   * breaks page render. */
  static navigationBadge: NavigationBadgeHandler | undefined = undefined

  /** Pill color for the badge. */
  static navigationBadgeColor: NavigationBadgeColor = 'default'

  /** Class name (`Resource.name` / `Global.name` / `Page.name`) of a
   * parent nav item. Renders nested under the parent when set; renders
   * at top level when the name doesn't resolve. */
  static navigationParentItem: string | undefined = undefined

  /** Column that names a record when referring to it in search results,
   * breadcrumbs, or relation pickers. Resolution order at the call site
   * is `recordTitleAttribute` → `'name'` → `'title'` → `'id'`. */
  static recordTitleAttribute: string | undefined = undefined

  /**
   * Optional ORM model. When set, `defaultPages` auto-fills `Form.save`,
   * `Form.loadRecord`, `Table.records`, and `Resource.deleteRecord` so
   * the common CRUD case needs no manual wiring. Anything explicitly
   * configured on `form()` / `table()` still wins.
   *
   * Any object satisfying `ModelLike` works — `@rudderjs/orm` `Model`
   * subclasses do so structurally via their static methods.
   */
  static model?: ModelLike

  // ─── Plan #10: authorization predicates ────────────────────
  // All async, all default `true`. Routes call them with the resolved
  // user (from `Pilotiq.user(fn)`); the renderer threads the same user
  // into nav-tree filtering and `Action.create/edit/view/delete`
  // factories. Override per-resource with role/policy logic. The user
  // argument is whatever `Pilotiq.user(req => …)` returns — opaque to
  // pilotiq, your shape.

  /** Coarse "should this resource exist for this user at all" gate.
   * Failing `canAccess` drops the resource from the nav tree entirely
   * and 403s every route under it. */
  static async canAccess(_user: unknown): Promise<boolean> { return true }

  /** Allowed to load the index/list page. Item still appears in nav
   * when `canAccess` passes but `canViewAny` fails — the URL just 403s. */
  static async canViewAny(_user: unknown): Promise<boolean> { return true }

  /** Allowed to load the read-only view page for a given record. */
  static async canView(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /** Allowed to access the create page + invoke the create form.
   * Auto-hides `Action.create(R, …)` triggers that haven't set an
   * explicit `.visible()` rule. */
  static async canCreate(_user: unknown): Promise<boolean> { return true }

  /** Allowed to edit a given record. Auto-hides `Action.edit(R, …)`
   * triggers without an explicit `.visible()` rule. */
  static async canEdit(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /** Allowed to delete a given record. Auto-hides `Action.delete(R, …)`
   * triggers without an explicit `.visible()` rule. */
  static async canDelete(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /**
   * Configure the form used by `create` and `edit` pages by default.
   * Receives a fresh `Form` instance; return the configured form.
   */
  static form(form: Form): Form { return form }

  /**
   * Configure the table used by the `index` page by default.
   * Receives a fresh `Table` instance; return the configured table.
   */
  static table(table: Table): Table { return table }

  /**
   * Schema for the read-only `view` page. Receives the loaded record.
   * Returns an array of Elements (typically Sections + display elements).
   */
  static detail(_record: unknown): Element[] { return [] }

  /**
   * Delete a record by id. Falls through to `model.delete(id)` when
   * `static model` is set; otherwise throws so the user knows to wire
   * something up. Override on the subclass for custom delete logic.
   * Wired up by the `POST {base}/{slug}/{id}/delete` route.
   */
  static async deleteRecord(id: string): Promise<void> {
    if (this.model) {
      await this.model.delete(id)
      return
    }
    throw new Error(
      `[Pilotiq] ${this.name}: no deleteRecord(id) implementation. Set Resource.model = … or override Resource.deleteRecord to wire up deletion.`,
    )
  }

  /**
   * User-overridable page map. Return any subset of `{ index, create, edit, view }`
   * to override the auto-generated defaults; missing keys fall through to
   * defaults via `resolvePages()`.
   */
  static pages(): ResourcePages { return {} }

  /**
   * Resolved page map: defaults from `defaultPages(this)` overlaid with whatever
   * `pages()` returns. This is what routing consumes (wired in 2.3).
   */
  static resolvePages(): ResourcePages {
    const defaults  = defaultPages(this as unknown as ResourceClass)
    const overrides = this.pages()
    return { ...defaults, ...overrides }
  }

  /** Phase 3+ relations metadata. */
  static relations(): RelationDef[] { return [] }

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

/** Constructor type for `Resource` subclasses. Used in panel registration. */
export type ResourceClass = typeof Resource
