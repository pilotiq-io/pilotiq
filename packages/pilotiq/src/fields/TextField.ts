import { Field } from './Field.js'

export class TextField extends Field {
  private _maxLength?: number

  private constructor(name: string) {
    super(name, 'text')
  }

  static make(name: string): TextField {
    return new TextField(name)
  }

  maxLength(n: number): this { this._maxLength = n; return this }
  getMaxLength(): number | undefined { return this._maxLength }
}
