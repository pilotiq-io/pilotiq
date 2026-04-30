import { Element, type ElementMeta } from './schema/Element.js'
import type { ModelQuery } from './orm/modelDefaults.js'
import type { TableContext } from './elements/Table.js'

/** Color preset for the tab's count badge. Maps to the same palette as
 * `BadgeColumn` so a "Drafts (5)" badge can be tinted warning/destructive
 * etc. without inventing a new color system. */
export type TabBadgeColor =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'

/** Server-side counter callback. Resolved in parallel during the page-data
 * pass (see `pageData.resourceIndexData`). Returns `undefined` to omit the
 * badge for this render — handy for "show count only when non-zero". */
export type TabBadgeHandler = () =>
  | string
  | number
  | undefined
  | Promise<string | number | undefined>

/** ORM query customizer. Same shape as `Filter.query()` so tab predicates
 * compose into the same `ModelQuery` chain inside `modelTableRecords`. */
export type TabQueryHandler = (query: ModelQuery) => ModelQuery

/** TableContext customizer for resources that don't use the model adapter.
 * Applied to the context before user-supplied `Table.records(fn)` runs. */
export type TabContextHandler = (ctx: TableContext) => TableContext

/** Serialized shape — what the renderer reads. */
export interface ListTabMeta extends ElementMeta {
  type:        'listTab'
  name:        string
  label:       string
  icon?:       string
  badge?:      string
  badgeColor?: TabBadgeColor
  /** True when this tab matches the URL's `?tab=` query (or is the default
   * when the param is absent). The renderer uses this to mark the trigger
   * with `data-active`. */
  active:      boolean
  /** Pre-built URL for this tab — already includes `?tab=name` plus any
   * other carry-forward query params (search/sort/filters). The renderer
   * uses this directly so the tab strip is just `<a href>` triggers. */
  url:         string
}

/**
 * Single list-page tab — a query-shortcut + count-badge primitive that
 * sits in a `ListTabs` strip above the table on a resource list page.
 * Distinct from the form-side `Tab` (under `Tabs.make().tabs([…])`) which
 * holds form-children rather than narrowing a query.
 *
 * @example
 * ListTab.make('drafts')
 *   .label('Drafts')
 *   .badge(() => prisma.article.count({ where: { status: 'draft' } }))
 *   .badgeColor('warning')
 *   .modifyQuery(q => q.where('status', 'draft'))
 */
export class ListTab extends Element {
  readonly name: string
  protected _label?:        string
  protected _icon?:         string
  protected _badge?:        string | TabBadgeHandler
  protected _badgeColor?:   TabBadgeColor
  protected _default        = false
  protected _queryFn?:      TabQueryHandler
  protected _contextFn?:    TabContextHandler

  // Render-time state — populated by the framework before serialization.
  protected _active         = false
  protected _resolvedBadge?: string
  protected _url?:           string

  protected constructor(name: string) {
    super()
    this.name = name
  }

  static make(name: string): ListTab {
    return new ListTab(name)
  }

  // ─── Builder ──────────────────────────────────────────

  label(l: string): this { this._label = l; return this }
  icon(i: string): this { this._icon = i; return this }

  /** Static string OR server-side callback (`() => Promise<string|number>`).
   * Callbacks resolve in parallel with the table's `records()` handler. */
  badge(b: string | TabBadgeHandler): this { this._badge = b; return this }

  badgeColor(c: TabBadgeColor): this { this._badgeColor = c; return this }

  /** Mark this tab as the default (when `?tab=` is absent). Without this
   * flag, the first tab in `getTabs()` is the default. */
  default(): this { this._default = true; return this }

  /** ORM query customizer — chained into `modelTableRecords` next to
   * `Filter.query()`. Receives the running `ModelQuery` and returns the
   * modified query (e.g. `q => q.where('status', 'draft')`). */
  modifyQuery(fn: TabQueryHandler): this { this._queryFn = fn; return this }

  /** TableContext customizer — escape hatch for resources whose
   * `Table.records(fn)` reads a custom field off `ctx`. Most users want
   * `modifyQuery`. */
  modifyContext(fn: TabContextHandler): this { this._contextFn = fn; return this }

  // ─── Render-time setters ─────────────────────────────

  withActive(v = true): this { this._active = v; return this }
  withResolvedBadge(s: string | undefined): this {
    if (s === undefined) delete this._resolvedBadge
    else                 this._resolvedBadge = s
    return this
  }
  withUrl(s: string): this { this._url = s; return this }

  // ─── Getters ─────────────────────────────────────────

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }
  isDefault(): boolean { return this._default }
  isActive(): boolean { return this._active }
  getBadgeHandler(): TabBadgeHandler | undefined {
    return typeof this._badge === 'function' ? this._badge : undefined
  }
  getStaticBadge(): string | undefined {
    return typeof this._badge === 'string' ? this._badge : undefined
  }
  getQuery(): TabQueryHandler | undefined { return this._queryFn }
  getContextFn(): TabContextHandler | undefined { return this._contextFn }

  // ─── Element contract ────────────────────────────────

  override getType(): string { return 'listTab' }

  override toMeta(): ListTabMeta {
    const badge = this._resolvedBadge ?? this.getStaticBadge()
    return {
      type:   'listTab',
      name:   this.name,
      label:  this.getLabel(),
      active: this._active,
      url:    this._url ?? `?tab=${encodeURIComponent(this.name)}`,
      ...(this._icon       !== undefined ? { icon:       this._icon       } : {}),
      ...(badge            !== undefined ? { badge                        } : {}),
      ...(this._badgeColor !== undefined ? { badgeColor: this._badgeColor } : {}),
    }
  }
}
