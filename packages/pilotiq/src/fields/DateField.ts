import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import { assertTimezone } from './dateTimeWire.js'

export class DateField extends Field {
  protected _withTime = false
  protected _timezone: string | undefined

  protected constructor(name: string, fieldType: string = 'date') {
    super(name, fieldType)
  }

  static make(name: string): DateField {
    return this.configured(new DateField(name))
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

  /**
   * Display and parse the time-of-day in an explicit IANA timezone
   * (Filament idiom). The stored value stays a UTC instant — only the
   * wall-clock shown in (and read back from) the picker shifts. Without
   * this, both sides default to UTC wall time. No effect on date-only
   * fields (a zone shift could move the calendar day).
   */
  timezone(tz: string): this {
    try {
      assertTimezone(tz)
    } catch {
      throw new Error(`DateField('${this.name}').timezone(): unknown IANA timezone '${tz}'`)
    }
    this._timezone = tz
    return this
  }

  getTimezone(): string | undefined { return this._timezone }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      ...(this._withTime ? { withTime: true } : {}),
      ...(this._timezone ? { timezone: this._timezone } : {}),
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
    return this.configured(new DateTimePickerField(name))
  }
}

export const DateTimePicker = DateTimePickerField
