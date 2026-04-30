import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class DateField extends Field {
  private constructor(name: string) {
    super(name, 'date')
  }

  static make(name: string): DateField {
    return new DateField(name)
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}
