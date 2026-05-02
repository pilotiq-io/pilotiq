import { Field, type FieldMeta, type FieldType, type RenderContext } from '@pilotiq/pilotiq'

export type CodeEditorTheme = 'auto' | 'light' | 'dark'

// Inherits `fieldType` from FieldMeta; we don't narrow it here because the
// `FieldType` union admits `(string & {})` which makes the narrow `'code'`
// literal incompatible during interface extension. `fieldType` is always
// `'code'` at runtime.
export interface CodeEditorFieldMeta extends FieldMeta {
  language?:        string
  height?:          string
  lineNumbers:      boolean
  lineWrapping:     boolean
  indentWithTabs:   boolean
  indentSize:       number
  theme:            CodeEditorTheme
  readOnly:         boolean
}

/**
 * Field that renders a CodeMirror 6 code editor — syntax highlighting,
 * line numbers, bracket matching, indent-aware tab handling. Stores the
 * raw text under the field name; no coerce branch needed.
 *
 * Languages are pulled from a registry rather than passed inline so meta
 * stays JSON-serializable. Register languages once at app boot:
 *
 * @example
 * ```ts
 * import { json } from '@codemirror/lang-json'
 * import { CodeEditorField, registerCodeLanguage } from '@pilotiq/codemirror'
 *
 * registerCodeLanguage('json', json)
 *
 * CodeEditorField.make('config')
 *   .label('Configuration')
 *   .language('json')
 *   .height('400px')
 * ```
 */
export class CodeEditorField extends Field {
  private _language:       string | undefined
  private _height:         string | undefined
  private _lineNumbers     = true
  private _lineWrapping    = false
  private _indentWithTabs  = false
  private _indentSize      = 2
  private _theme:          CodeEditorTheme = 'auto'
  private _readOnly        = false

  private constructor(name: string) {
    super(name, 'code' as FieldType)
  }

  static make(name: string): CodeEditorField {
    return new CodeEditorField(name)
  }

  /** Registry id for the language extension (e.g. `'json'`, `'sql'`). */
  language(id: string): this {
    this._language = id
    return this
  }

  /** CSS height of the editor surface (e.g. `'400px'`, `'60vh'`). */
  height(value: string): this {
    this._height = value
    return this
  }

  /** Show line numbers in the gutter. Defaults to `true`. */
  lineNumbers(enabled: boolean): this {
    this._lineNumbers = enabled
    return this
  }

  /** Soft-wrap long lines instead of horizontal scrolling. Defaults to `false`. */
  lineWrapping(enabled: boolean): this {
    this._lineWrapping = enabled
    return this
  }

  /** Insert a real tab character on `Tab`. Defaults to `false` (insert spaces). */
  indentWithTabs(enabled: boolean): this {
    this._indentWithTabs = enabled
    return this
  }

  /** Indent width in columns. Defaults to `2`. */
  indentSize(size: number): this {
    this._indentSize = size
    return this
  }

  /**
   * Color scheme. `'auto'` follows `prefers-color-scheme`; `'light'` and
   * `'dark'` force a fixed theme. Defaults to `'auto'`.
   */
  theme(value: CodeEditorTheme): this {
    this._theme = value
    return this
  }

  /** Render the editor read-only. Defaults to `false`. */
  readOnly(enabled: boolean): this {
    this._readOnly = enabled
    return this
  }

  getLanguage():       string | undefined { return this._language }
  getHeight():         string | undefined { return this._height }
  hasLineNumbers():    boolean { return this._lineNumbers }
  hasLineWrapping():   boolean { return this._lineWrapping }
  isIndentWithTabs():  boolean { return this._indentWithTabs }
  getIndentSize():     number { return this._indentSize }
  getTheme():          CodeEditorTheme { return this._theme }
  isReadOnly():        boolean { return this._readOnly }

  override toMeta(ctx?: RenderContext): CodeEditorFieldMeta {
    // CodeEditorField has no async resolvers, so the parent always returns
    // the sync FieldMeta branch — cast away the union for the spread.
    const base = super.toMeta(ctx) as FieldMeta
    return {
      ...base,
      ...(this._language !== undefined ? { language: this._language } : {}),
      ...(this._height !== undefined ? { height: this._height } : {}),
      lineNumbers:    this._lineNumbers,
      lineWrapping:   this._lineWrapping,
      indentWithTabs: this._indentWithTabs,
      indentSize:     this._indentSize,
      theme:          this._theme,
      readOnly:       this._readOnly,
    }
  }
}

/** Short alias matching `Markdown`, `TagsInput`, `Repeater` ergonomics. */
export const Code = CodeEditorField
