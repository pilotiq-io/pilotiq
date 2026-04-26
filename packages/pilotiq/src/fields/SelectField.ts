import { Field, type FieldMeta } from './Field.js'

export class SelectField extends Field {
  private _options: Array<{ value: string; label: string }> = []

  private constructor(name: string) {
    super(name, 'select')
  }

  static make(name: string): SelectField {
    return new SelectField(name)
  }

  options(opts: Array<{ value: string; label: string }>): this {
    this._options = opts; return this
  }

  getOptions(): Array<{ value: string; label: string }> { return this._options }

  override toMeta(record?: unknown): FieldMeta {
    return {
      ...super.toMeta(record),
      options: this._options,
    }
  }
}
