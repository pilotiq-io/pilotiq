import { Field } from './Field.js'

export class TextareaField extends Field {
  private _rows = 4

  private constructor(name: string) {
    super(name, 'textarea')
  }

  static make(name: string): TextareaField {
    return new TextareaField(name)
  }

  rows(n: number): this { this._rows = n; return this }
  getRows(): number { return this._rows }
}
