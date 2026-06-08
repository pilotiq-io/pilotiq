import { Column, type ColumnMeta } from '../Column.js'

/** Badge color preset → tailwind class group. Resolved client-side. */
export type BadgeColor =
  | 'gray' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

/**
 * Renders the cell value as a colored pill / chip. Use a value→color map
 * to assign different presets per status: e.g. drafts grey, published
 * green, archived amber. Unknown values fall back to `gray`.
 */
export class BadgeColumn extends Column {
  protected _colors: Record<string, BadgeColor> = {}

  static override make(name: string): BadgeColumn {
    const c = new BadgeColumn(name)
    c.setColumnType('badge')
    return this.configured(c)
  }

  /** value-to-color map. */
  colors(map: Record<string, BadgeColor>): this {
    this._colors = { ...this._colors, ...map }
    return this
  }

  protected override serializeExtras(meta: ColumnMeta): void {
    if (Object.keys(this._colors).length > 0) {
      meta.badgeColors = this._colors
    }
  }
}
