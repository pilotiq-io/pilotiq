import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import type { Page } from './Page.js'
import type { ModelLike, ModelQuery } from './orm/modelDefaults.js'
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

  // ─── Plan #12: global search ───────────────────────────────
  // Opt-in: resources with `globalSearch = false` are skipped by the
  // panel-level Cmd+K palette. Defaults below derive everything from
  // already-shipped surfaces (`recordTitleAttribute`, `Column.searchable()`,
  // the standard view URL) so the common case needs zero overrides.

  /** Include this resource in Cmd+K palette results. Default `false` —
   * quiet resources don't pollute results until users opt in. */
  static globalSearch: boolean = false

  /**
   * Columns the default search query LIKE-matches against. The default
   * dedupes `recordTitleAttribute` (Plan #9) with every searchable
   * column on the resource's table. Override to constrain or extend.
   * Returning an empty array effectively opts the resource out even
   * when `globalSearch=true`.
   */
  static globallySearchableAttributes(): string[] {
    const attrs = new Set<string>()
    if (this.recordTitleAttribute) attrs.add(this.recordTitleAttribute)
    // Materialise the resource's configured table once and read every
    // `searchable()` column off it. The Table builder is a pure
    // configuration call (no DB hits, no I/O), so doing this per
    // search request is fine; resources that don't want this can
    // override `globallySearchableAttributes()` directly.
    try {
      const table = this.table(Table.make())
      for (const col of table.getColumns()) {
        if (col.isSearchable()) attrs.add(col.name)
      }
    } catch { /* defensive — bad user table()? skip */ }
    return [...attrs]
  }

  /**
   * Title shown in the palette result row. Default resolution chain:
   * `record[recordTitleAttribute]` → `record.name` → `record.title` →
   * `record.id`. Override to customise (e.g. include the id).
   */
  static getGlobalSearchResultTitle(record: unknown): string {
    const r = record as Record<string, unknown> | null | undefined
    if (!r) return ''
    if (this.recordTitleAttribute && r[this.recordTitleAttribute] !== undefined) {
      return String(r[this.recordTitleAttribute])
    }
    if (r['name']  !== undefined) return String(r['name'])
    if (r['title'] !== undefined) return String(r['title'])
    if (r['id']    !== undefined) return String(r['id'])
    return ''
  }

  /**
   * Optional second-line text under the title. Returning `undefined`
   * tells the renderer to skip the subtitle row. Useful for status,
   * timestamps, or category pills.
   */
  static getGlobalSearchResultSubtitle(_record: unknown): string | undefined {
    return undefined
  }

  /**
   * URL the palette navigates to on Enter. Default uses the View page
   * when one exists, else the Edit page, else the resource list. Pass
   * `base` (the panel base path) so overrides don't have to thread it
   * through the panel config.
   */
  static getGlobalSearchResultUrl(record: unknown, base: string): string {
    const r = record as Record<string, unknown> | null | undefined
    const slug = this.getSlug()
    if (!r) return `${base}/${slug}`
    const id = r['id']
    if (id === undefined || id === null) return `${base}/${slug}`
    return `${base}/${slug}/${String(id)}`
  }

  /**
   * Override the default LIKE-on-attributes search query. Return a
   * `ModelQuery` (still chainable through `paginate(1, limit)`) for
   * advanced cases — joins, full-text, `pg_trgm`. Returning `undefined`
   * (the default) falls through to the framework-built query.
   */
  static getGlobalSearchQuery(_needle: string): ModelQuery | undefined {
    return undefined
  }

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
