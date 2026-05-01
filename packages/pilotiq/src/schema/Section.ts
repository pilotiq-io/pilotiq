import { Element } from './Element.js'

/**
 * Container that groups related Elements (typically Fields) under a heading
 * with optional description. Supports multi-column layouts and a collapsible
 * disclosure pattern. Mirrors panels' `Section` element.
 *
 * Used inside Forms to group related inputs, but composes anywhere a
 * container Element fits (e.g. inside a Card or another Section).
 *
 * Plan #8 polish: `icon / badge / aside / compact / persistCollapsed`.
 */
export class Section extends Element {
  private _description?: string
  private _icon?: string
  private _badge?: string
  private _columns: 1 | 2 | 3 = 1
  private _collapsible = false
  private _defaultCollapsed = false
  private _aside = false
  private _compact = false
  private _persistCollapsed = false
  private _persistKey?: string

  private constructor(private _title?: string) {
    super()
  }

  static make(title?: string): Section {
    return new Section(title)
  }

  description(d: string): this { this._description = d; return this }

  /**
   * Icon shown next to the section title. Resolved through the icon
   * registry (`registerIcons({ name: Component })`) at render. Schema-time
   * icons are string-only — component-typed icons are reserved for
   * Resource/Global/Page where the Vite plugin can mint a manifest key.
   */
  icon(name: string): this { this._icon = name; return this }

  /** Right-aligned pill in the section header. Pure cosmetic. */
  badge(text: string): this { this._badge = text; return this }

  /** Number of columns the section's children are laid out in. Defaults to 1. */
  columns(n: 1 | 2 | 3): this { this._columns = n; return this }

  /** Allow the user to collapse this section. Off by default. */
  collapsible(v = true): this { this._collapsible = v; return this }

  /** Start collapsed (only meaningful when `collapsible` is true). */
  defaultCollapsed(v = true): this { this._defaultCollapsed = v; return this }

  /**
   * Render this section as the right-rail aside when nested inside a
   * `Split` parent. No-op outside a `Split`.
   */
  aside(v = true): this { this._aside = v; return this }

  /** Tighter padding + smaller heading. Useful in dense settings pages. */
  compact(v = true): this { this._compact = v; return this }

  /**
   * Persist the open/closed state to localStorage so user choices survive
   * navigation. Only meaningful when `collapsible` is true. The optional
   * `key` overrides the auto-key (which is built from the page slug +
   * section title at render time).
   */
  persistCollapsed(key?: string): this {
    this._persistCollapsed = true
    if (key !== undefined) this._persistKey = key
    return this
  }

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
      ...(this._icon        ? { icon:        this._icon        } : {}),
      ...(this._badge       ? { badge:       this._badge       } : {}),
      columns:    this._columns,
      collapsible: this._collapsible,
      ...(this._collapsible && this._defaultCollapsed ? { defaultCollapsed: true } : {}),
      ...(this._collapsible && this._persistCollapsed ? {
        persistCollapsed: true,
        ...(this._persistKey ? { persistKey: this._persistKey } : {}),
      } : {}),
      ...(this._aside   ? { aside:   true } : {}),
      ...(this._compact ? { compact: true } : {}),
    }
  }
}
