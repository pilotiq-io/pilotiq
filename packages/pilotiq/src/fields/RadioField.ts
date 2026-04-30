import { Field, type FieldMeta } from './Field.js'
import { resolveOptions, type OptionsResolver, type SelectOption } from './optionsResolver.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Single-choice field rendered as a stack of `<input type="radio">`
 * + label rows. Reuses the same `OptionsResolver` shape as
 * `SelectField` so dependent options work the same way: pass an
 * array for static, or a function for `({ $get }) => …`.
 *
 * `inline()` switches the layout from vertical to a horizontal row
 * — convenient for short lists (≤4 options).
 */
export class RadioField extends Field {
  private _options: SelectOption[] | OptionsResolver = []
  private _inline = false

  private constructor(name: string) {
    super(name, 'radio')
  }

  static make(name: string): RadioField {
    return new RadioField(name)
  }

  options(opts: SelectOption[] | OptionsResolver): this {
    this._options = opts
    return this
  }

  inline(value: boolean = true): this {
    this._inline = value
    return this
  }

  getOptions(): SelectOption[] {
    return Array.isArray(this._options) ? this._options : []
  }

  hasDynamicOptions(): boolean {
    return typeof this._options === 'function'
  }

  isInline(): boolean { return this._inline }

  override async toMeta(ctx?: RenderContext): Promise<FieldMeta> {
    const base    = this.buildMeta(ctx)
    const options = await resolveOptions(this._options, ctx, this.name)
    return {
      ...base,
      options,
      ...(this._inline ? { inline: true } : {}),
    }
  }
}

export const Radio = RadioField
