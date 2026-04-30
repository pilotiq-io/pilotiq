import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class SlugField extends Field {
  private _from?: string

  private constructor(name: string) {
    super(name, 'slug')
  }

  static make(name: string): SlugField {
    return new SlugField(name)
  }

  from(field: string): this { this._from = field; return this }
  getFrom(): string | undefined { return this._from }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      ...(this._from ? { from: this._from } : {}),
    }
  }
}
