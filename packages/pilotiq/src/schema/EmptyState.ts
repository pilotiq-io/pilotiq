import { Element } from './Element.js'
import type { Action } from '../actions/Action.js'

/**
 * Schema-level empty-state primitive — distinct from `Table.emptyState`
 * (which is table-chrome). Use this when an entire page section, custom
 * page, or dashboard zone has nothing to show. Drops into any layout
 * the same way as `Heading` / `Text` / `Alert` do.
 *
 *   EmptyState.make('No reports yet')
 *     .description('Create your first report to get started.')
 *     .icon('file-text')
 *     .footer([Action::make('create').url('/admin/reports/create')])
 *
 * v1 ships heading + description + icon + footer + `contained()`. Per-
 * page-mode visibility, columnSpan etc. inherit from `Element`.
 */
export class EmptyState extends Element {
  private _description?: string
  private _icon?:        string
  private _contained:    boolean = true

  private constructor(private heading: string) {
    super()
  }

  static make(heading: string): EmptyState {
    return new EmptyState(heading)
  }

  description(d: string): this { this._description = d; return this }
  icon(name: string):     this { this._icon        = name; return this }

  /**
   * Disable the default card-styled wrapper (background + border +
   * padding) — useful when nesting inside another container that
   * already brings its own chrome. Default `true` (contained).
   */
  contained(v = true): this { this._contained = v; return this }

  /**
   * Action buttons rendered below the description. Same shape as
   * `Heading.actions(...)` — actions land on `_children` and serialize
   * through the standard schema walker so `Action.evaluate(ctx)` for
   * visibility / authorize fires unchanged.
   */
  footer(actions: Action[]): this {
    this._children = actions
    return this
  }

  override getType(): string { return 'emptyState' }

  override toMeta() {
    return {
      type:      'emptyState' as const,
      heading:   this.heading,
      contained: this._contained,
      ...(this._description ? { description: this._description } : {}),
      ...(this._icon        ? { icon:        this._icon        } : {}),
    }
  }
}
