import { Field, type FieldMeta } from './Field.js'
import {
  resolveOptions,
  disableOptionsTakenInSiblings,
  type OptionsResolver,
  type SelectOption,
} from './optionsResolver.js'
import type { RenderContext } from '../schema/resolveSchema.js'

// Re-export for back-compat — earlier code imported these directly from
// SelectField. New code should prefer `fields/optionsResolver.ts`.
export type { OptionsResolver, SelectOption }

export class SelectField extends Field {
  private _options: SelectOption[] | OptionsResolver = []

  private constructor(name: string) {
    super(name, 'select')
  }

  static make(name: string): SelectField {
    return new SelectField(name)
  }

  /**
   * Static option list, or a resolver function for dependent options.
   * The function form receives `{ $get, $set, record, user, values }`
   * and runs every resolve — server-canonical, so it's safe to read
   * from a database.
   */
  options(opts: SelectOption[] | OptionsResolver): this {
    this._options = opts
    return this
  }

  /**
   * Returns the static option array. Returns the empty array when
   * options are configured as a function — callers wanting the
   * resolved list should go through `toMeta(ctx)`.
   */
  getOptions(): SelectOption[] {
    return Array.isArray(this._options) ? this._options : []
  }

  /** Whether options are configured as a (potentially async) resolver. */
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
    return { ...base, options }
  }
}
