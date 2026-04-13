import { Field } from './Field.js'

export class ToggleField extends Field {
  private constructor(name: string) {
    super(name, 'toggle')
  }

  static make(name: string): ToggleField {
    return new ToggleField(name)
  }
}
