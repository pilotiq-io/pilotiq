import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

export class TextareaField extends Field {
  private _rows = 4
  private _cols?: number
  private _autosize = false
  private _disableGrammarly = false

  private constructor(name: string) {
    super(name, 'textarea')
  }

  static make(name: string): TextareaField {
    return new TextareaField(name)
  }

  rows(n: number): this { this._rows = n; return this }
  getRows(): number { return this._rows }

  /**
   * HTML `cols` attribute on the underlying `<textarea>`. Sets the
   * visible character width independent of the parent column / span.
   * Most apps lean on `rows()` + the field's flex layout instead — pass
   * `cols(n)` only when you need an explicit character-grid width.
   */
  cols(n: number): this { this._cols = n; return this }
  getCols(): number | undefined { return this._cols }

  /**
   * Auto-grow the textarea so its height matches the typed content (no
   * scrollbar until `maxHeight`). Implemented in CSS via the existing
   * `field-sizing-content` utility on `<Textarea>` — `autosize()` simply
   * keeps the chrome and unsets the explicit `rows` so the browser can
   * size to content. Off by default to preserve the legacy fixed-height
   * look on bare `TextareaField.make(...)`.
   */
  autosize(v = true): this { this._autosize = v; return this }
  isAutosize(): boolean { return this._autosize }

  /**
   * Add `data-gramm="false"` (plus the matching Grammarly extension
   * disable attributes) so the third-party browser overlay doesn't mount
   * on this field. Use for sensitive content (slug source, DB queries,
   * code snippets) where the overlay's UI corrupts cursor placement.
   */
  disableGrammarly(v = true): this { this._disableGrammarly = v; return this }
  isGrammarlyDisabled(): boolean { return this._disableGrammarly }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      rows: this._rows,
      ...(this._cols !== undefined ? { cols: this._cols } : {}),
      ...(this._autosize ? { autosize: true } : {}),
      ...(this._disableGrammarly ? { disableGrammarly: true } : {}),
    }
  }
}
