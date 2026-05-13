import type { Element } from './schema/Element.js'
import type { Form } from './elements/Form.js'
import { Table } from './elements/Table.js'
import type { Page } from './Page.js'
import type { ModelLike, ModelQuery, QueryContext } from './orm/modelDefaults.js'
import type { IconValue } from './icons/types.js'
import { defaultPages } from './defaultPages.js'
import type { RelationManager } from './RelationManager.js'
import type { SchemaContext } from './schema/resolveSchema.js'
import type { ClusterClass } from './Cluster.js'
import { resourceBasePath } from './clusterPaths.js'

/** Map of resource page roles to Page subclasses. */
export interface ResourcePages {
  index?:  typeof Page
  create?: typeof Page
  edit?:   typeof Page
  view?:   typeof Page
  /**
   * Record-scoped custom sub-pages. Each entry is a `Page` subclass
   * mounted at `${resourceBase}/${slug}/:id/${subPageSlug}`. Tabs show
   * up in the `RelationTabs` sub-nav strip between the `__edit` tab
   * and the relation-manager tabs.
   *
   * Sub-page slugs are validated at panel boot:
   *   - Must match `[A-Za-z0-9_-]+`.
   *   - Must not collide with reserved tokens (`edit`, `delete`,
   *     `restore`, `force-delete`, `_form`, `_action`, `_search`,
   *     `_uploads`, `_attach`, `_detach`, `_bulk-detach`, `create`).
   *   - Must not collide with any `RelationManager.relationship` on
   *     the same resource.
   *
   * Each sub-page receives the loaded record in `ctx.record` and runs
   * its own `Page.canAccess(user, record)` gate after the parent
   * resource's `canAccess` + `canView` predicates have passed.
   */
  record?: Record<string, typeof Page>
}

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
 * Per-resource collab configuration. Set via `static collab = true` (the
 * 90% case — opts the edit page in with presence) or via the object form
 * for finer control. Omitting `static collab` entirely keeps the resource
 * collab-free even when the `@pilotiq-pro/collab` plugin is registered.
 *
 *   pages    — page roles where collab activates. `'edit'` syncs values +
 *              presence; `'view'` is presence-only (the page is read-only,
 *              value-sync would be moot). Defaults to `['edit']`.
 *   presence — when false, suppress the awareness layer (focus chips,
 *              cursor positions) while keeping value-sync. Defaults to true.
 *
 * Field-level `.collab(false)` always wins over this setting — opting the
 * resource in then opting individual fields out is the supported shape.
 */
export interface ResourceCollabConfig {
  pages:    ReadonlyArray<'edit' | 'view'>
  presence: boolean
}

/** Raw shape accepted by `static collab` before normalization. `true` is a
 * shorthand for `{ pages: ['edit'], presence: true }`. */
export type ResourceCollabInput = boolean | {
  pages?:    ReadonlyArray<'edit' | 'view'>
  presence?: boolean
}

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

  /** Breadcrumb label override. Falls through to `label`. Use this when
   *  the breadcrumb chain reads better with a different word than the
   *  sidebar / page-title plural — e.g. `label = 'Blog Posts'` paired
   *  with `breadcrumb = 'Posts'` for a tighter chain. */
  static breadcrumb: string | undefined = undefined

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

  /**
   * Cluster this resource belongs to. When set, the resource's URLs gain
   * the cluster's slug as a prefix segment (e.g. `/admin/content/articles`
   * instead of `/admin/articles`) and the resource nests under the
   * cluster's nav entry instead of appearing at the panel top level.
   *
   * The referenced class must be registered via `Pilotiq.clusters([…])`;
   * boot fails otherwise.
   */
  static cluster?: ClusterClass

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

  /**
   * Hook for scoping every query against this resource's table — list
   * pages, global search, find-by-PK loads (record load for view / edit
   * pages, policy lookups). Default returns `this.model.query()`.
   *
   * Override to install tenant scopes, default ordering, eager-load
   * defaults, or any other always-on filter:
   *
   * @example
   * static override query(ctx) {
   *   return super.query(ctx).where('tenantId', (ctx?.user as any)?.tenantId)
   * }
   *
   * @example
   * static override query(ctx) {
   *   return super.query(ctx).orderBy('createdAt', 'DESC')
   * }
   *
   * Soft-delete restore / force-delete routes deliberately bypass this
   * — they build their own `query().withTrashed()` chain so a scope that
   * hides trashed rows doesn't hide records the operator is trying to
   * recover. Everything else routes through here.
   *
   * Throws when `static model` isn't set; subclasses without a model
   * must override `query()` directly to return whatever query builder
   * they're driving.
   */
  static query(_ctx?: QueryContext): ModelQuery {
    if (!this.model) {
      throw new Error(
        `[Pilotiq] ${this.name}.query() requires \`static model = …\` to be set, ` +
        `or override \`static query(ctx)\` directly to return a custom ModelQuery.`,
      )
    }
    return this.model.query()
  }

  // ─── Plan #13: soft deletes ────────────────────────────────
  // Opt-in: when true, pilotiq routes the standard delete action
  // through `model.delete()` (which writes `deletedAt`), surfaces a
  // TrashedFilter on the list page, swaps the row-action set on
  // trashed rows (Restore + Force-delete instead of Edit + Delete),
  // and exposes two new POST routes: `/:id/restore` and
  // `/:id/force-delete`. The rudder ORM side must also opt in
  // (`Model.softDeletes = true`) for the underlying behavior to
  // engage — pilotiq throws a clear boot error when the flag is
  // set here but the model lacks `restore` / `forceDelete`.

  /** Enable soft-delete UX (TrashedFilter, Restore action,
   * Force-delete action, soft-delete-aware row visibility). Default
   * `false`. Requires `Resource.model` to be set, with
   * `Model.softDeletes = true` on the rudder side. */
  static softDeletes: boolean = false

  /** Column name carrying the soft-delete timestamp on each row.
   * Per-row visibility predicates and the trashed-row branch in
   * `Action.delete` consult `record[deletedAtColumn]`. Default
   * matches rudder's `'deletedAt'`. */
  static deletedAtColumn: string = 'deletedAt'

  /** Persist the active list filter / search / sort slice on the
   *  user's session so revisiting the resource lands on the same view.
   *  No-ops silently when `@rudderjs/session` isn't mounted. */
  static persistFiltersInSession: boolean = false

  /** Skip server-side row loading on list pages; the client paints a
   *  skeleton and fetches rows from `GET {base}/{slug}/_table` after
   *  mount. URL chrome (filters / search / page / group) still mirrors
   *  on the SSR pass so the skeleton frame doesn't reset visible state. */
  static deferLoading: boolean = false

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
    const prefix = resourceBasePath(base, this)
    if (!r) return prefix
    const id = r['id']
    if (id === undefined || id === null) return prefix
    return `${prefix}/${String(id)}`
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

  // ─── Realtime collab opt-in ────────────────────────────────
  // Opt-in per resource. The `@pilotiq-pro/collab` plugin registers the
  // global singletons (transport, Tiptap extension factory, RecordWrapper
  // factory); resources with `static collab` unset stay collab-free even
  // when the plugin is installed. Field-level `.collab(false)` overrides
  // this setting per field.

  /** Enable collab on this resource. `true` is the 90% case — shorthand
   * for `{ pages: ['edit'], presence: true }`. Use the object form to
   * narrow which page roles activate or to suppress presence. Default
   * `false` (collab off — the WS room is never opened for this resource). */
  static collab: ResourceCollabInput = false

  /**
   * Normalize `static collab` into the canonical wire shape, or return
   * `null` when the resource has opted out. Centralizes the `true` →
   * defaults expansion and the `{ pages?: … }` merge.
   *
   * Result lands on `panelInfo().recordCollab[slug]`; the gate reads it
   * to decide whether to mount the record wrapper.
   */
  static getResolvedCollabConfig(): ResourceCollabConfig | null {
    const raw = this.collab
    if (raw === false || raw == null) return null
    if (raw === true) return { pages: ['edit'], presence: true }
    return {
      pages:    raw.pages    ?? ['edit'],
      presence: raw.presence ?? true,
    }
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

  /** Plan #13 — allowed to restore a soft-deleted record. Defaults
   * `true`; auto-hides `Action.restore(R, …)` when false. Only
   * checked on resources with `softDeletes = true`. */
  static async canRestore(_user: unknown, _record: unknown): Promise<boolean> { return true }

  /** Plan #13 — allowed to permanently delete a soft-deleted record.
   * Defaults to whatever `canDelete` returns when this method is *not*
   * overridden — soft-delete restore is generally lower-privilege
   * than force-delete, but force-delete inheriting from delete is the
   * conservative starting point. Override this to tighten or loosen
   * independently. Only checked on resources with `softDeletes = true`.
   *
   * The `safeForceDeletePolicy` helper (used by routes + `Action.forceDelete`
   * visibility) detects the un-overridden case via reference equality
   * against `Resource.canForceDelete` — same trick Plan #11 uses for
   * `safeManagerPolicy`. Don't reassign `Resource.canForceDelete`
   * outside of subclass overrides; it'd break the detection globally. */
  static async canForceDelete(this: ResourceClass, user: unknown, record: unknown): Promise<boolean> {
    return this.canDelete(user, record)
  }

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
   * Plan #15 — schema rendered above the list-page table. Default `[]`.
   * Typical use: dashboard widgets that contextualize the list (KPI cards,
   * charts, status alerts). Anything Element-typed is allowed —
   * `Group / Card / Section` for layout, `Stat / StatsOverview / Chart /
   * TableWidget / View` for server-data widgets, `Heading / Alert` for
   * static chrome. Resolves with the same `SchemaContext` passed to the
   * list page's schema (carries `mode: 'table'`, `basePath`, `user`).
   * Server-data widgets inside resolve in parallel via the shared
   * `_widgetData` map and re-fetch through `POST {base}/{slug}/_widget/:id`.
   * The hook only fires after `Resource.canAccess(user)` passes (route-level
   * gate) — there's no extra per-hook authorization.
   */
  static headerSchema(_ctx?: SchemaContext): Element[] | Promise<Element[]> { return [] }

  /**
   * Plan #15 — schema rendered below the list-page table. Default `[]`.
   * Same shape and posture as `headerSchema()`; useful for footnotes,
   * legends, or "longest-running…" tables that contextualize the list
   * from below.
   */
  static footerSchema(_ctx?: SchemaContext): Element[] | Promise<Element[]> { return [] }

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

  /**
   * Sugar over `resolvePages().record ?? {}` for callers that only need
   * the record-scoped sub-pages (route registration, tab insertion, boot
   * validation). Returns an empty object when no record sub-pages are
   * declared so callers can iterate without a defensive null check.
   */
  static getRecordPages(): Record<string, typeof Page> {
    return this.resolvePages().record ?? {}
  }

  /**
   * Plan #11 — relation managers mounted under this resource's edit /
   * view pages. Each entry is a `RelationManager` subclass; routes are
   * registered under `${base}/${slug}/:id/${manager.relationship}`.
   * Default empty.
   */
  static relations(): Array<typeof RelationManager> { return [] }

  /** URL slug, derived from `label` when not set explicitly. */
  static getSlug(): string {
    return this.slug || this.label.toLowerCase().replace(/\s+/g, '-')
  }

  /** Sidebar label: `navigationLabel` override falls through to `label`. */
  static getNavigationLabel(): string {
    return this.navigationLabel ?? this.label
  }

  /** Breadcrumb label: `breadcrumb` override falls through to `label`. */
  static getBreadcrumb(): string {
    return this.breadcrumb ?? this.label
  }

  /** Sidebar icon: `navigationIcon` override falls through to `icon`. */
  static getNavigationIcon(): IconValue {
    return this.navigationIcon ?? this.icon
  }
}

/** Constructor type for `Resource` subclasses. Used in panel registration. */
export type ResourceClass = typeof Resource
