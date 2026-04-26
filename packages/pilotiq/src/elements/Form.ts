import { Element, type ElementMeta } from '../schema/Element.js'
import type { Validator, ValidationErrors } from '../validation/index.js'

export type FormMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface FormContext<R = unknown> {
  values: Record<string, unknown>
  record?: R
  request?: unknown
  [key: string]: unknown
}

export type SaveHandler<R = unknown> = (
  data: Record<string, unknown>,
  ctx: FormContext<R>,
) => Promise<R> | R

export type MutateDataHandler = (
  data: Record<string, unknown>,
  ctx: FormContext,
) => Record<string, unknown> | Promise<Record<string, unknown>>

export type LifecycleHandler<R = unknown> = (
  data: Record<string, unknown>,
  ctx: FormContext<R>,
) => void | Promise<void>

export type AfterSaveHandler<R = unknown> = (
  record: R,
  ctx: FormContext<R>,
) => void | Promise<void>

export type RedirectHandler<R = unknown> = (
  record: R,
  ctx: FormContext<R>,
) => string

export type LoadRecordHandler<R = unknown> = (
  id: string,
  ctx: FormContext<R>,
) => Promise<R | null> | R | null

export type FillFromRecordHandler<R = unknown> = (
  record: R,
) => Record<string, unknown>

export interface FormMeta extends ElementMeta {
  type:    'form'
  formId:  string
  method:  FormMethod
  action?: string
  values?: Record<string, unknown>
  errors?: ValidationErrors
}

let _formIdSeq = 0
function nextFormId(): string {
  _formIdSeq += 1
  return `form-${_formIdSeq}`
}

/**
 * Form container. Holds children (Fields, Sections, Tabs, Actions, …) plus
 * a server-side lifecycle: validate → mutateData → beforeSave → save →
 * afterSave → redirectAfterSave. Handlers stay on the server; `toMeta()`
 * emits only what the client needs to render the form (id, method, action
 * URL, current values, validation errors).
 *
 * Phase 2.1 ships the shape and serialization. Lifecycle dispatch on POST
 * is wired in 2.4.
 */
export class Form<R = unknown> extends Element {
  private _formId = nextFormId()
  private _method: FormMethod = 'post'
  private _action?: string

  private _formValidators: Validator[] = []
  private _mutateData?: MutateDataHandler
  private _beforeSave?: LifecycleHandler<R>
  private _save?: SaveHandler<R>
  private _afterSave?: AfterSaveHandler<R>
  private _redirectAfterSave?: RedirectHandler<R>
  private _fillFromRecord?: FillFromRecordHandler<R>
  private _loadRecord?: LoadRecordHandler<R>

  private _values?: Record<string, unknown>
  private _errors?: ValidationErrors

  private constructor() { super() }

  static make<R = unknown>(): Form<R> {
    return new Form<R>()
  }

  // ─── Children ─────────────────────────────────────────

  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  // ─── Static config ────────────────────────────────────

  formId(id: string): this { this._formId = id; return this }
  method(m: FormMethod): this { this._method = m; return this }
  action(url: string): this { this._action = url; return this }

  // ─── Lifecycle setters ────────────────────────────────

  /** Form-level validators run after field-level ones. Useful for cross-field rules. */
  validate(...validators: Validator[]): this {
    this._formValidators.push(...validators)
    return this
  }

  /** Transform the validated payload before `save()`. Runs after validation passes. */
  mutateData(fn: MutateDataHandler): this {
    this._mutateData = fn
    return this
  }

  beforeSave(fn: LifecycleHandler<R>): this { this._beforeSave = fn; return this }

  /**
   * Persistence handler. Required for any form that accepts submits. No
   * default implementation — Phase 3 will ship an ORM adapter.
   */
  save(fn: SaveHandler<R>): this { this._save = fn; return this }

  afterSave(fn: AfterSaveHandler<R>): this { this._afterSave = fn; return this }

  /** Where to redirect after a successful save. Receives the saved record. */
  redirectAfterSave(fn: RedirectHandler<R>): this {
    this._redirectAfterSave = fn
    return this
  }

  /** Map a loaded record into form values for edit mode. Defaults to `{ ...record }`. */
  fillFromRecord(fn: FillFromRecordHandler<R>): this {
    this._fillFromRecord = fn
    return this
  }

  /** Load a record by id for edit mode. */
  loadRecord(fn: LoadRecordHandler<R>): this {
    this._loadRecord = fn
    return this
  }

  // ─── Render-time state ────────────────────────────────

  /**
   * Set the current form values for rendering. Called by route handlers in
   * edit mode (after `loadRecord` + `fillFromRecord`) and on validation
   * errors (so the user's input is preserved).
   */
  withValues(values: Record<string, unknown>): this {
    this._values = values
    return this
  }

  /** Attach validation errors for re-render after a failed submit. */
  withErrors(errors: ValidationErrors): this {
    this._errors = errors
    return this
  }

  // ─── Getters (used by route handlers) ────────────────

  getFormId(): string { return this._formId }
  getMethod(): FormMethod { return this._method }
  getAction(): string | undefined { return this._action }
  getFormValidators(): Validator[] { return this._formValidators }
  getMutateData(): MutateDataHandler | undefined { return this._mutateData }
  getBeforeSave(): LifecycleHandler<R> | undefined { return this._beforeSave }
  getSave(): SaveHandler<R> | undefined { return this._save }
  getAfterSave(): AfterSaveHandler<R> | undefined { return this._afterSave }
  getRedirectAfterSave(): RedirectHandler<R> | undefined { return this._redirectAfterSave }
  getFillFromRecord(): FillFromRecordHandler<R> | undefined { return this._fillFromRecord }
  getLoadRecord(): LoadRecordHandler<R> | undefined { return this._loadRecord }

  // ─── Serialization ────────────────────────────────────

  getType(): string { return 'form' }

  override toMeta(): FormMeta {
    return {
      type:   'form',
      formId: this._formId,
      method: this._method,
      ...(this._action !== undefined ? { action: this._action } : {}),
      ...(this._values !== undefined ? { values: this._values } : {}),
      ...(this._errors !== undefined ? { errors: this._errors } : {}),
    }
  }
}

/** @internal — reset the formId counter; tests use this to keep ids stable. */
export function _resetFormIdSeq(): void {
  _formIdSeq = 0
}
