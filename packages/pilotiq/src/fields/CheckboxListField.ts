import { Field, type FieldMeta } from './Field.js'
import { resolveOptions, type OptionsResolver, type SelectOption } from './optionsResolver.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Multi-choice field. Value is `string[]`. Same `OptionsResolver`
 * shape as `SelectField` / `RadioField` so dependent options work
 * everywhere identically.
 *
 * `columns(n)` lays the checkboxes out in an `n`-wide grid; default
 * 1 (vertical stack).
 */
export class CheckboxListField extends Field {
  private _options: SelectOption[] | OptionsResolver = []
  private _columns = 1

  private constructor(name: string) {
    super(name, 'checkboxList')
  }

  static make(name: string): CheckboxListField {
    return new CheckboxListField(name)
  }

  options(opts: SelectOption[] | OptionsResolver): this {
    this._options = opts
    return this
  }

  columns(n: number): this {
    this._columns = Math.max(1, Math.floor(n))
    return this
  }

  getOptions(): SelectOption[] {
    return Array.isArray(this._options) ? this._options : []
  }

  hasDynamicOptions(): boolean {
    return typeof this._options === 'function'
  }

  getColumns(): number { return this._columns }

  override async toMeta(ctx?: RenderContext): Promise<FieldMeta> {
    const base    = this.buildMeta(ctx)
    const options = await resolveOptions(this._options, ctx, this.name)
    return {
      ...base,
      options,
      ...(this._columns !== 1 ? { columns: this._columns } : {}),
    }
  }
}

export const CheckboxList = CheckboxListField
