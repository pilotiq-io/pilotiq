import { Field } from './Field.js'

export class DateField extends Field {
  private constructor(name: string) {
    super(name, 'date')
  }

  static make(name: string): DateField {
    return new DateField(name)
  }
}
