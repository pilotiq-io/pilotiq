import { Field, type FieldMeta } from './Field.js'
import {
  resolveOptions,
  disableOptionsTakenInSiblings,
  type OptionsResolver,
  type SelectOption,
} from './optionsResolver.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Single-choice field rendered as a horizontal segmented chip group.
 * Sugar over `RadioField` with the same `OptionsResolver` shape; the
 * difference is purely visual — `RadioField` paints a vertical (or
 * `inline:true`) stack of native radios, `ToggleButtonsField` paints
 * a row of pill-shaped buttons styled like a segmented control.
 *
 * Multi-select is intentionally out of scope in v1; reach for
 * `CheckboxListField` for that.
 */
export class ToggleButtonsField extends Field {
  private _options: SelectOption[] | OptionsResolver = []

  private constructor(name: string) {
    super(name, 'toggleButtons')
  }

  static make(name: string): ToggleButtonsField {
    return new ToggleButtonsField(name)
  }

  options(opts: SelectOption[] | OptionsResolver): this {
    this._options = opts
    return this
  }

  getOptions(): SelectOption[] {
    return Array.isArray(this._options) ? this._options : []
  }

  hasDynamicOptions(): boolean {
    return typeof this._options === 'function'
  }

  override async toMeta(ctx?: RenderContext): Promise<FieldMeta> {
    const base    = this.buildMeta(ctx)
    const options = disableOptionsTakenInSiblings(
      await resolveOptions(this._options, ctx, this.name),
      this.shouldDisableOptionsTakenInSiblings(),
      this.name,
      ctx,
    )
    return {
      ...base,
      options,
    }
  }
}

export const ToggleButtons = ToggleButtonsField
