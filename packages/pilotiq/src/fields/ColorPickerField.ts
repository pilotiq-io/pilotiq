import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Hex color input. UI is a native `<input type="color">` plus a text
 * mirror so users can paste literal hex codes. Value persisted as
 * `#rrggbb`.
 *
 * v1: no swatches preset, no alpha channel.
 */
export class ColorPickerField extends Field {
  private constructor(name: string) {
    super(name, 'color')
  }

  static make(name: string): ColorPickerField {
    return this.configured(new ColorPickerField(name))
  }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return this.buildMeta(ctx)
  }
}

export const ColorPicker = ColorPickerField
