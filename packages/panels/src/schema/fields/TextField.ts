import { Field } from '../Field.js'
import { FieldType } from '../FieldType.js'

export class TextField extends Field {
  static make(name: string): TextField {
    return new TextField(name)
  }

  getType(): string { return FieldType.Text }

  minLength(n: number): this {
    this._extra['minLength'] = n
    return this
  }

  maxLength(n: number): this {
    this._extra['maxLength'] = n
    return this
  }

  placeholder(text: string): this {
    this._extra['placeholder'] = text
    return this
  }
}
