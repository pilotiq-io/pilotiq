import { Element, type ElementMeta } from '../schema/Element.js'
import type { RenderMode } from '../schema/resolveSchema.js'
import type { SerializedRule, Validator, ValidatorContext } from '../validation/Validator.js'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'number'
  | 'select'
  | 'toggle'
  | 'date'
  | 'slug'
  // Permits external packages (`@pilotiq/tiptap` etc.) to declare their own
  // fieldType strings without having to widen this union. The `& {}` trick
  // keeps autocomplete on the literal members for built-ins.
  | (string & {})

/**
 * JSON-serializable field metadata sent to the client.
 *
 * Extends `ElementMeta` so Fields are first-class members of the resolved
 * schema tree. Top-level `type` is always `'field'`; the `fieldType`
 * sub-discriminator tells the client which input to render. Avoiding
 * `type: 'text'` for TextField keeps it from clashing with the `Text`
 * display element.
 */
export interface FieldMeta extends ElementMeta {
  type:         'field'
  fieldType:    FieldType
  name:         string
  label:        string
  required:     boolean
  disabled:     boolean
  placeholder?: string
  rules?:       SerializedRule[]
}

export type FieldCondition = (record: unknown) => boolean

export abstract class Field extends Element {
  readonly name: string
  readonly fieldType: FieldType

  protected _label: string
  protected _required = false
  protected _readonly = false
  protected _placeholder?: string

  // Visibility flags — exclude this field from a specific render mode.
  // Evaluated by the field resolver against `RenderContext.mode`.
  protected _hideFromTable  = false
  protected _hideFromCreate = false
  protected _hideFromEdit   = false
  protected _hideFromView   = false

  // Condition callbacks — evaluated server-side against `RenderContext.record`.
  // No-op when no record is present (e.g. create mode).
  protected _showWhen?:     FieldCondition
  protected _hideWhen?:     FieldCondition
  protected _disabledWhen?: FieldCondition

  // Validators run server-side on submit. Each may carry a serialized
  // descriptor mirrored to the client via `toMeta().rules` for live UX.
  protected _validators: Validator[] = []

  constructor(name: string, type: FieldType) {
    super()
    this.name = name
    this.fieldType = type
    this._label = name.charAt(0).toUpperCase() + name.slice(1)
  }

  /** All fields share the `'field'` type discriminator; client switches on `fieldType`. */
  getType(): string { return 'field' }

  // ─── Static config ────────────────────────────────────

  label(l: string): this { this._label = l; return this }
  required(v = true): this { this._required = v; return this }
  readonly(v = true): this { this._readonly = v; return this }
  placeholder(p: string): this { this._placeholder = p; return this }

  // ─── Visibility flags ─────────────────────────────────

  hideFromTable(v = true):  this { this._hideFromTable  = v; return this }
  hideFromCreate(v = true): this { this._hideFromCreate = v; return this }
  hideFromEdit(v = true):   this { this._hideFromEdit   = v; return this }
  hideFromView(v = true):   this { this._hideFromView   = v; return this }

  // ─── Conditions ───────────────────────────────────────

  showWhen(fn: FieldCondition):     this { this._showWhen     = fn; return this }
  hideWhen(fn: FieldCondition):     this { this._hideWhen     = fn; return this }
  disabledWhen(fn: FieldCondition): this { this._disabledWhen = fn; return this }

  // ─── Validation ───────────────────────────────────────

  /**
   * Append one or more validators. Multiple calls accumulate; pass an array
   * to add several at once. Order is preserved — `runValidators()` collects
   * every error in order so the user sees all problems at once.
   */
  validate(v: Validator | Validator[]): this {
    if (Array.isArray(v)) this._validators.push(...v)
    else this._validators.push(v)
    return this
  }

  getValidators(): Validator[] { return this._validators }

  // ─── Getters (read-only access for resolver/tests) ───

  getLabel(): string { return this._label }
  isRequired(): boolean { return this._required }
  isReadonly(): boolean { return this._readonly }
  getPlaceholder(): string | undefined { return this._placeholder }

  // ─── Resolution ───────────────────────────────────────

  /**
   * Whether this field should be omitted from the rendered output for the
   * current context. Combines the `_hideFromMode` flags (when `mode` is set)
   * and the `showWhen` / `hideWhen` callbacks (when `record` is present).
   */
  isHiddenIn(mode?: RenderMode, record?: unknown): boolean {
    if (mode === 'table'  && this._hideFromTable)  return true
    if (mode === 'create' && this._hideFromCreate) return true
    if (mode === 'edit'   && this._hideFromEdit)   return true
    if (mode === 'view'   && this._hideFromView)   return true
    if (record !== undefined && this._showWhen && !this._showWhen(record)) return true
    if (record !== undefined && this._hideWhen &&  this._hideWhen(record)) return true
    return false
  }

  /**
   * Resolved disabled state — `true` if `readonly()` is set OR
   * `disabledWhen()` returns true for the current record.
   */
  isDisabledIn(record?: unknown): boolean {
    if (this._readonly) return true
    if (record !== undefined && this._disabledWhen) return this._disabledWhen(record)
    return false
  }

  /**
   * Run every validator against `value`, collecting all error messages in
   * declaration order. The `_required` flag implicitly contributes a
   * required check unless the validator list already includes one (matched
   * by `serialized.rule === 'required'`) — keeps `.required()` and
   * `.validate(required())` from double-firing.
   */
  runValidators(value: unknown, ctx?: ValidatorContext): string[] {
    const errors: string[] = []

    if (this._required && !this.hasRequiredValidator()) {
      if (value === undefined || value === null || value === '') {
        errors.push('This field is required')
      }
    }

    for (const v of this._validators) {
      const result = v(value, ctx)
      if (result) errors.push(result)
    }
    return errors
  }

  private hasRequiredValidator(): boolean {
    return this._validators.some(v => v.serialized?.rule === 'required')
  }

  /** Serialized rule descriptors mirrored to the client. */
  protected getSerializedRules(): SerializedRule[] {
    const rules: SerializedRule[] = []
    if (this._required && !this.hasRequiredValidator()) {
      rules.push({ rule: 'required', message: 'This field is required' })
    }
    for (const v of this._validators) {
      if (v.serialized) rules.push(v.serialized)
    }
    return rules
  }

  /**
   * Serialize this field's state for the client. Subclasses spread this and
   * add their own fields (e.g. `maxLength`, `options`).
   *
   * Disabled state is computed via `isDisabledIn(record)` — pass the current
   * record from `RenderContext` so `disabledWhen` evaluates correctly. If
   * omitted, only the static `readonly()` setting contributes.
   */
  override toMeta(record?: unknown): FieldMeta {
    const rules = this.getSerializedRules()
    return {
      type:        'field',
      fieldType:   this.fieldType,
      name:        this.name,
      label:       this._label,
      required:    this._required,
      disabled:    this.isDisabledIn(record),
      ...(this._placeholder ? { placeholder: this._placeholder } : {}),
      ...(rules.length > 0 ? { rules } : {}),
    }
  }
}
