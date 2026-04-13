import { Field } from './Field.js'

export class SlugField extends Field {
  private _from?: string

  private constructor(name: string) {
    super(name, 'slug')
  }

  static make(name: string): SlugField {
    return new SlugField(name)
  }

  from(field: string): this { this._from = field; return this }
  getFrom(): string | undefined { return this._from }
}
