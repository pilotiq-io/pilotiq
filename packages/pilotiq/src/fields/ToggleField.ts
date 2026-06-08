import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class ToggleField extends Field {
  private constructor(name: string) {
    super(name, 'toggle')
  }

  static make(name: string): ToggleField {
    return this.configured(new ToggleField(name))
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}
