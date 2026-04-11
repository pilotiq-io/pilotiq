import { Field } from '../Field.js'
import { FieldType } from '../FieldType.js'

export class NumberField extends Field {
  static make(name: string): NumberField {
    return new NumberField(name)
  }

  getType(): string { return FieldType.Number }

  min(n: number): this {
    this._extra['min'] = n
    return this
  }

  max(n: number): this {
    this._extra['max'] = n
    return this
  }

  step(n: number): this {
    this._extra['step'] = n
    return this
  }

  /** Render as a progress bar in the table view (0 to max). */
  progressBar(opts?: { max?: number; color?: string }): this {
    this._extra['progressBar'] = true
    if (opts?.max !== undefined) this._extra['progressMax'] = opts.max
    if (opts?.color !== undefined) this._extra['progressColor'] = opts.color
    return this
  }
}
