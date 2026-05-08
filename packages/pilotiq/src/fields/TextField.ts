import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import type { Action } from '../actions/Action.js'

/**
 * HTML5 `inputmode` values — drive the on-screen keyboard mobile browsers
 * pop up. `'text'` is the default; the others map 1:1 to spec values.
 */
export type TextInputMode =
  | 'none' | 'text' | 'numeric' | 'tel' | 'email' | 'decimal' | 'search' | 'url'

/**
 * HTML5 `autocapitalize` values — control which characters mobile virtual
 * keyboards capitalize automatically. `'off'` and `'none'` are aliases per
 * spec; we surface only `'off'` for clarity.
 */
export type TextAutocapitalize = 'off' | 'sentences' | 'words' | 'characters'

/**
 * Mask alphabet documented for `mask(pattern)`:
 *   `9` — digit (0-9)
 *   `a` — alpha (A-Za-z)
 *   `*` — alphanumeric or any character
 *   anything else — literal (rendered verbatim, skipped on input)
 *
 * Examples: `'(999) 999-9999'` (US phone), `'9999-9999-9999-9999'` (card),
 * `'aaa-9999'` (custom). The renderer formats values keystroke-by-keystroke
 * and strips literals from the submitted value so the persisted column
 * stores the raw digits/letters.
 */

export class TextField extends Field {
  private _maxLength?: number
  private _password   = false
  private _revealable = false
  private _copyable   = false
  private _copyMessage?: string
  private _mask?:        string
  private _datalist?:    string[]
  private _stripCharacters?: string[]
  private _inputMode?:        TextInputMode
  private _autocapitalize?:   TextAutocapitalize
  private _prefixAction?: Action
  private _suffixAction?: Action

  private constructor(name: string) {
    super(name, 'text')
  }

  static make(name: string): TextField {
    return new TextField(name)
  }

  maxLength(n: number): this { this._maxLength = n; return this }
  getMaxLength(): number | undefined { return this._maxLength }

  /**
   * Render the input as `type="password"`. Pair with `revealable()` to
   * surface an eye-icon toggle. Pure presentation — the column type +
   * value handling stays string-shaped.
   */
  password(v: boolean = true): this { this._password = v; return this }

  /**
   * Mount an eye-icon toggle in the suffix slot that flips the input
   * type between `password` and `text`. No-op when the field is not in
   * `password()` mode (the toggle hides itself client-side so a stray
   * `revealable()` on a non-password input doesn't render a useless
   * button).
   */
  revealable(v: boolean = true): this { this._revealable = v; return this }

  /**
   * Mount a copy button in the suffix slot that writes the current input
   * value to the clipboard. The optional message overrides the default
   * `'Copied!'` toast text — same convention as
   * `Column.copyMessage()`.
   */
  copyable(message?: string): this {
    this._copyable     = true
    if (message !== undefined) this._copyMessage = message
    return this
  }

  /**
   * Format the input keystroke-by-keystroke against the supplied mask
   * pattern. See `TextField` doc-block for the alphabet (`9` = digit,
   * `a` = alpha, `*` = any, literals passthrough). Submitted values are
   * stripped of literal characters before the form body lands on the
   * server — the persisted column stores the raw chars only.
   */
  mask(pattern: string): this { this._mask = pattern; return this }

  /**
   * Suggest values via a native HTML5 `<datalist>` attached to the
   * input. Browsers render an autocomplete dropdown; users can still
   * type a value not on the list. Useful for canonical-but-not-exclusive
   * sets (countries, departments, common email domains).
   */
  datalist(values: string[]): this { this._datalist = values.slice(); return this }

  /**
   * Strip the listed characters from the submitted value before
   * validation runs. Pass a single string (each char becomes a strip
   * token) or an array of strings. Useful for input-mask-style fields
   * where the persisted column should not carry the mask literals
   * (`'(' / ')' / '-' / ' '` for phone numbers, `' '` for credit cards).
   * The strip applies on both create and edit — server-side authority,
   * so a tampered client still gets cleaned values.
   */
  stripCharacters(chars: string | string[]): this {
    const list = typeof chars === 'string' ? Array.from(chars) : [...chars]
    if (list.length === 0) delete this._stripCharacters
    else this._stripCharacters = list
    return this
  }

  getStripCharacters(): string[] | undefined { return this._stripCharacters }

  /**
   * Set the HTML `inputmode` attribute — drives the virtual-keyboard
   * layout on mobile. Distinct from `type=` (a `text` field with
   * `inputMode('numeric')` still accepts non-digit pastes; for strict
   * numeric-only, use `NumberField` instead).
   */
  inputMode(mode: TextInputMode): this { this._inputMode = mode; return this }

  /** Set the HTML `autocapitalize` attribute. */
  autocapitalize(mode: TextAutocapitalize): this { this._autocapitalize = mode; return this }

  /**
   * Mount a clickable Action button in the prefix slot of the input
   * shell. Distinct from the passive `prefix()` decoration (which is a
   * string or icon descriptor only). Use this for an in-input affordance
   * — e.g. an OAuth-style "Generate" button next to an API key field.
   * The Action retains its full chrome (`.icon() / .color() / .visible()
   * / .modal*()`); visibility rules evaluate through the standard schema
   * walker the same way they do anywhere else.
   */
  prefixAction(action: Action): this { this._prefixAction = action; return this }

  /** Suffix-slot variant of `prefixAction`. Same semantics. */
  suffixAction(action: Action): this { this._suffixAction = action; return this }

  /** Read-only access for the resolver. */
  getPrefixAction(): Action | undefined { return this._prefixAction }
  getSuffixAction(): Action | undefined { return this._suffixAction }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      ...(this._maxLength      !== undefined ? { maxLength:      this._maxLength      } : {}),
      ...(this._password                       ? { password:       true                  } : {}),
      ...(this._revealable                     ? { revealable:     true                  } : {}),
      ...(this._copyable                       ? { copyable:       true                  } : {}),
      ...(this._copyMessage    !== undefined ? { copyMessage:    this._copyMessage    } : {}),
      ...(this._mask           !== undefined ? { mask:           this._mask           } : {}),
      ...(this._datalist       !== undefined ? { datalist:       this._datalist       } : {}),
      ...(this._stripCharacters!== undefined ? { stripCharacters:this._stripCharacters} : {}),
      ...(this._inputMode      !== undefined ? { inputMode:      this._inputMode      } : {}),
      ...(this._autocapitalize !== undefined ? { autocapitalize: this._autocapitalize } : {}),
    }
  }
}
