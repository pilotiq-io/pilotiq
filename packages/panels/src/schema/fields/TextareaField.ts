import { Field } from '../Field.js'
import { FieldType } from '../FieldType.js'

export class TextareaField extends Field {
  static make(name: string): TextareaField {
    return new TextareaField(name)
  }

  getType(): string { return FieldType.Textarea }

  rows(n: number): this {
    this._extra['rows'] = n
    return this
  }
}
