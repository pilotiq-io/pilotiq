import { Element } from './Element.js'

/**
 * Layout container that arranges its children in a column grid. Lighter than
 * `Section` — no title, no description, no collapsible disclosure. Use it
 * for ad-hoc multi-column layouts (e.g. side-by-side fields without a
 * surrounding form section).
 *
 * `columns` defaults to 2 and accepts any positive integer; the client
 * renderer is expected to clamp to a sensible max.
 */
export class Grid extends Element {
  private _columns = 2
  private _gap?: number

  private constructor() {
    super()
  }

  static make(): Grid {
    return new Grid()
  }

  columns(n: number): this { this._columns = n; return this }

  /** Optional gap between cells (units interpreted by the client renderer). */
  gap(n: number): this { this._gap = n; return this }

  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'grid' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'grid' as const,
      columns: this._columns,
      ...(this._gap !== undefined ? { gap: this._gap } : {}),
    }
  }
}
