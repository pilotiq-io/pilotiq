import { Element } from './Element.js'

/**
 * Container that groups related Elements (typically Fields) under a heading
 * with optional description. Supports multi-column layouts and a collapsible
 * disclosure pattern. Mirrors panels' `Section` element.
 *
 * Used inside Forms to group related inputs, but composes anywhere a
 * container Element fits (e.g. inside a Card or another Section).
 */
export class Section extends Element {
  private _description?: string
  private _columns: 1 | 2 | 3 = 1
  private _collapsible = false
  private _defaultCollapsed = false

  private constructor(private _title?: string) {
    super()
  }

  static make(title?: string): Section {
    return new Section(title)
  }

  description(d: string): this { this._description = d; return this }

  /** Number of columns the section's children are laid out in. Defaults to 1. */
  columns(n: 1 | 2 | 3): this { this._columns = n; return this }

  /** Allow the user to collapse this section. Off by default. */
  collapsible(v = true): this { this._collapsible = v; return this }

  /** Start collapsed (only meaningful when `collapsible` is true). */
  defaultCollapsed(v = true): this { this._defaultCollapsed = v; return this }

  /** Set the section's children. Any Element type is accepted. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'section' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'section' as const,
      ...(this._title       ? { title:       this._title       } : {}),
      ...(this._description ? { description: this._description } : {}),
      columns:    this._columns,
      collapsible: this._collapsible,
      ...(this._collapsible && this._defaultCollapsed ? { defaultCollapsed: true } : {}),
    }
  }
}
