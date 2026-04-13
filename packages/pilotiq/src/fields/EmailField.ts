import { Field } from './Field.js'

export class EmailField extends Field {
  private constructor(name: string) {
    super(name, 'email')
  }

  static make(name: string): EmailField {
    return new EmailField(name)
  }
}
