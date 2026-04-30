import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export type SelectOption = { value: string; label: string }

/**
 * Reactive options resolver. Receives the same `{ $get, $set, record,
 * user, values }` ctx that `afterStateUpdated` sees, runs every resolve
 * cycle, and may be async (for DB-backed lookups). Throws are swallowed
 * to an empty array + console.warn.
 */
export type OptionsResolver = (ctx: {
  $get?:    (name: string) => unknown
  $set?:    (name: string, value: unknown) => void
  record?:  unknown
  user?:    unknown
  values?:  Record<string, unknown>
}) => SelectOption[] | Promise<SelectOption[]>

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
    const base = this.buildMeta(ctx)
    let options: SelectOption[]
    if (typeof this._options === 'function') {
      try {
        options = await this._options({
          ...(ctx?.$get   ? { $get:   ctx.$get   } : {}),
          ...(ctx?.$set   ? { $set:   ctx.$set   } : {}),
          ...(ctx?.record !== undefined ? { record: ctx.record } : {}),
          ...(ctx?.user   !== undefined ? { user:   ctx.user   } : {}),
          ...(ctx?.values ? { values: ctx.values } : {}),
        })
      } catch (err) {
        console.warn(`[pilotiq] SelectField.options() resolver for "${this.name}" threw:`, err)
        options = []
      }
    } else {
      options = this._options
    }
    return { ...base, options }
  }
}
