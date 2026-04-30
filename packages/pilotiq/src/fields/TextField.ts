import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class TextField extends Field {
  private _maxLength?: number

  private constructor(name: string) {
    super(name, 'text')
  }

  static make(name: string): TextField {
    return new TextField(name)
  }

  maxLength(n: number): this { this._maxLength = n; return this }
  getMaxLength(): number | undefined { return this._maxLength }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      ...(this._maxLength !== undefined ? { maxLength: this._maxLength } : {}),
    }
  }
}
