import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Single boolean field rendered as a square checkbox + side label.
 * Distinct from `ToggleField` — Toggle is a pill-style switch and
 * conventionally signals an active/inactive state, while Checkbox
 * conventionally signals an opt-in or accept-terms-style choice.
 *
 * Both produce the same shape of body value. `coerceFormValues`
 * normalizes either to `true | false` via the same branch.
 */
export class CheckboxField extends Field {
  private constructor(name: string) {
    super(name, 'checkbox')
  }

  static make(name: string): CheckboxField {
    return new CheckboxField(name)
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}

export const Checkbox = CheckboxField
