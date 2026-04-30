import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class EmailField extends Field {
  private constructor(name: string) {
    super(name, 'email')
  }

  static make(name: string): EmailField {
    return new EmailField(name)
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}
