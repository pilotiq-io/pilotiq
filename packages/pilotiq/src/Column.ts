export class Column {
  readonly name: string
  private _label?: string
  private _sortable = false
  private _searchable = false

  private constructor(name: string) {
    this.name = name
  }

  static make(name: string): Column {
    return new Column(name)
  }

  label(l: string): this { this._label = l; return this }
  sortable(v = true): this { this._sortable = v; return this }
  searchable(v = true): this { this._searchable = v; return this }

  getLabel(): string { return this._label ?? this.name.charAt(0).toUpperCase() + this.name.slice(1) }
  isSortable(): boolean { return this._sortable }
  isSearchable(): boolean { return this._searchable }
}
