import { Column, type ColumnMeta } from '../Column.js'

/** HTML `<input type=…>` discriminator for `TextInputColumn`. Mirrors
 * the subset of types we coerce server-side; richer types (date, color,
 * file) belong to dedicated columns or stay form-only. */
export type TextInputColumnType = 'text' | 'number' | 'email' | 'url' | 'tel'

/**
 * Inline-edit text input. Renders an `<input>` directly in the cell;
 * commits via debounced PATCH on typing + immediate PATCH on blur.
 *
 *   TextInputColumn.make('title')
 *     .placeholder('Untitled')
 *     .validate([required(), minLength(3)])
 *     .debounce(750)
 *
 * Numeric variant:
 *
 *   TextInputColumn.make('price').type('number').step(0.01).min(0)
 */
export class TextInputColumn extends Column {
  protected _inputType: TextInputColumnType = 'text'
  protected _inputPlaceholder?: string
  protected _step?: number
  protected _min?:  number
  protected _max?:  number
  protected _debounceMs?: number

  static override make(name: string): TextInputColumn {
    const c = new TextInputColumn(name)
    c.setColumnType('textInput')
    return this.configured(c)
  }

  /** Map to `<input type=…>`. Default `'text'`. `'number'` parses to
   * a JS number server-side; the rest stay strings. */
  type(t: TextInputColumnType): this { this._inputType = t; return this }

  /** Input placeholder (the text shown when the input is empty). NOT
   * the same as `Column.placeholder()` / `default()`, which is the
   * empty-cell fallback for read-only formatters. */
  placeholder(p: string): this { this._inputPlaceholder = p; return this }

  /** Numeric `<input step=…>`. */
  step(n: number): this { this._step = n; return this }

  /** Numeric `<input min=…>`. */
  min(n: number): this { this._min = n; return this }

  /** Numeric `<input max=…>`. */
  max(n: number): this { this._max = n; return this }

  /** Override the renderer's default debounce. Time between the last
   * keystroke and the PATCH fire (ms). Blur always commits immediately
   * regardless. */
  debounce(ms: number): this { this._debounceMs = ms; return this }

  getInputType(): TextInputColumnType { return this._inputType }

  protected override serializeExtras(meta: ColumnMeta): void {
    if (this._inputType !== 'text') meta.inputType = this._inputType
    if (this._inputPlaceholder !== undefined) meta.inputPlaceholder = this._inputPlaceholder
    if (this._step !== undefined) meta.inputStep = this._step
    if (this._min  !== undefined) meta.inputMin  = this._min
    if (this._max  !== undefined) meta.inputMax  = this._max
    if (this._debounceMs !== undefined) meta.debounceMs = this._debounceMs
  }
}
