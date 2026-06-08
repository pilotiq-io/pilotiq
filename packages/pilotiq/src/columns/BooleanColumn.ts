import { IconColumn } from './IconColumn.js'

/**
 * Sugar over `IconColumn` that defaults to a check / x rendering for
 * boolean values. Override the icons / colors via `.options()` if the
 * defaults don't fit.
 */
export class BooleanColumn extends IconColumn {
  static override make(name: string): BooleanColumn {
    const c = new BooleanColumn(name)
    c.setColumnType('boolean')
    c.options({
      true:  { icon: 'check-circle-2', color: 'success' },
      false: { icon: 'circle',         color: 'muted'   },
    })
    return this.configured(c)
  }
}
