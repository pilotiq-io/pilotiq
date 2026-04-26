import { Element, type ElementMeta } from './schema/Element.js'

export interface ColumnMeta extends ElementMeta {
  type:       'column'
  name:       string
  label:      string
  sortable:   boolean
  searchable: boolean
}

/**
 * Table column primitive. Joins the schema tree as an Element so it
 * serializes through the same resolver pipeline as Fields and display
 * elements. Lives as a child of `Table`.
 */
export class Column extends Element {
  readonly name: string
  private _label?: string
  private _sortable = false
  private _searchable = false

  private constructor(name: string) {
    super()
    this.name = name
  }

  static make(name: string): Column {
    return new Column(name)
  }

  label(l: string): this { this._label = l; return this }
  sortable(v = true): this { this._sortable = v; return this }
  searchable(v = true): this { this._searchable = v; return this }

  getLabel(): string {
    return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1)
  }
  isSortable(): boolean { return this._sortable }
  isSearchable(): boolean { return this._searchable }

  getType(): string { return 'column' }

  override toMeta(): ColumnMeta {
    return {
      type:       'column',
      name:       this.name,
      label:      this.getLabel(),
      sortable:   this._sortable,
      searchable: this._searchable,
    }
  }
}
