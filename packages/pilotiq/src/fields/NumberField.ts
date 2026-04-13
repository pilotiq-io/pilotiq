import { Field } from './Field.js'

export class NumberField extends Field {
  private _min?: number
  private _max?: number
  private _step?: number

  private constructor(name: string) {
    super(name, 'number')
  }

  static make(name: string): NumberField {
    return new NumberField(name)
  }

  min(n: number): this { this._min = n; return this }
  max(n: number): this { this._max = n; return this }
  step(n: number): this { this._step = n; return this }

  getMin(): number | undefined { return this._min }
  getMax(): number | undefined { return this._max }
  getStep(): number | undefined { return this._step }
}
