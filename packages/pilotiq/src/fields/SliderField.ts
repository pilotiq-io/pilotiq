import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Numeric slider. `min`, `max` required at config time (we don't
 * fall back to 0/100 silently — most use cases have meaningful bounds
 * and a forgotten `.min()` should surface fast). `step` defaults to 1.
 *
 * Value coerces through the same path as `NumberField` — we declare
 * `fieldType: 'slider'` for the renderer dispatch but `coerceFormValues`
 * routes both through the number branch.
 */
export class SliderField extends Field {
  private _min = 0
  private _max = 100
  private _step = 1
  private _showValue = false

  private constructor(name: string) {
    super(name, 'slider')
  }

  static make(name: string): SliderField {
    return new SliderField(name)
  }

  min(n: number): this  { this._min  = n; return this }
  max(n: number): this  { this._max  = n; return this }
  step(n: number): this { this._step = n; return this }

  /** Display the current numeric value next to the slider. */
  showValue(value: boolean = true): this {
    this._showValue = value
    return this
  }

  getMin(): number { return this._min }
  getMax(): number { return this._max }
  getStep(): number { return this._step }
  isShowingValue(): boolean { return this._showValue }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      min:  this._min,
      max:  this._max,
      step: this._step,
      ...(this._showValue ? { showValue: true } : {}),
    }
  }
}

export const Slider = SliderField
