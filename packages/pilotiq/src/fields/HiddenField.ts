import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * A non-rendered field that round-trips a value through the form
 * without exposing it to the user. Useful for source-attribution
 * stamps, CSRF round-trips, computed values that the server needs to
 * see, etc.
 *
 * Distinct from `Form`'s built-in `_formId` discriminator — that's
 * framework chrome. `Hidden` is for app-level state.
 */
export class HiddenField extends Field {
  private constructor(name: string) {
    super(name, 'hidden')
  }

  static make(name: string): HiddenField {
    return this.configured(new HiddenField(name))
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}

/** Public alias so callers can write `Hidden.make()`. */
export const Hidden = HiddenField
