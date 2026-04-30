import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class DateField extends Field {
  protected _withTime = false

  protected constructor(name: string, fieldType: string = 'date') {
    super(name, fieldType)
  }

  static make(name: string): DateField {
    return new DateField(name)
  }

  /**
   * Include a time picker alongside the date picker. Coerces the
   * combined `YYYY-MM-DDTHH:mm` body value into a `Date` on submit
   * (the renderer reads `withTime` off the meta to pick the right
   * input). Equivalent to using `DateTimePicker.make()` directly,
   * which constructs with the `'dateTime'` fieldType discriminator
   * for renderer dispatch.
   */
  withTime(value: boolean = true): this {
    this._withTime = value
    return this
  }

  hasTime(): boolean { return this._withTime }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      ...(this._withTime ? { withTime: true } : {}),
    }
  }
}

/**
 * `DateField` with `.withTime()` baked in. Same class, different
 * default — for users who'd rather declare intent through the type
 * than chain a setter.
 */
export class DateTimePickerField extends DateField {
  private constructor(name: string) {
    super(name, 'dateTime')
    this._withTime = true
  }

  static make(name: string): DateTimePickerField {
    return new DateTimePickerField(name)
  }
}

export const DateTimePicker = DateTimePickerField
