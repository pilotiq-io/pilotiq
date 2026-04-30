import { Element, type ElementMeta } from '../schema/Element.js'
import type { Validator, ValidationErrors } from '../validation/index.js'
import type { Notification, NotificationMeta } from '../notifications/index.js'

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

/**
 * Transform values during the edit-mode load path. `mutateFormDataBeforeFill`
 * runs before `fillFromRecord` (input is whatever was passed into the form);
 * `mutateFormDataAfterFill` runs after, on the values produced by
 * `fillFromRecord`. Both receive the loaded record on `ctx.record`.
 */
export type FillMutator<R = unknown> = (
  values: Record<string, unknown>,
  ctx: FormContext<R>,
) => Record<string, unknown> | Promise<Record<string, unknown>>

/**
 * Resolve a saved-notification spec into a `Notification`/meta. `null`
 * means "skip" (notifications disabled for this mode). Strings shorthand
 * to a success notification with that title.
 */
export type SavedNotificationHandler<R = unknown> =
  | string
  | Notification
  | NotificationMeta
  | null
  | ((record: R, ctx: FormContext<R>) => string | Notification | NotificationMeta | null)

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
  private _mutateDataBeforeCreate?: MutateDataHandler
  private _mutateDataBeforeUpdate?: MutateDataHandler
  private _beforeSave?: LifecycleHandler<R>
  private _beforeCreate?: LifecycleHandler<R>
  private _beforeUpdate?: LifecycleHandler<R>
  private _save?: SaveHandler<R>
  private _handleCreate?: SaveHandler<R>
  private _handleUpdate?: SaveHandler<R>
  private _afterSave?: AfterSaveHandler<R>
  private _afterCreate?: AfterSaveHandler<R>
  private _afterUpdate?: AfterSaveHandler<R>
  private _redirectAfterSave?: RedirectHandler<R>
  private _fillFromRecord?: FillFromRecordHandler<R>
  private _mutateFormDataBeforeFill?: FillMutator<R>
  private _mutateFormDataAfterFill?: FillMutator<R>
  private _loadRecord?: LoadRecordHandler<R>

  /**
   * Saved-notification spec for the generic both-modes path. Mode-specific
   * specs (`_createdNotification`) take precedence in their respective mode.
   * `null` means "explicitly disabled" (different from undefined which means
   * "use the framework default"). `false` (via `disableSavedNotification`)
   * disables for both modes regardless of mode-specific spec.
   */
  private _savedNotification?: SavedNotificationHandler<R> | null
  private _createdNotification?: SavedNotificationHandler<R> | null
  private _savedNotificationDisabled = false

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

  /**
   * Transform the validated payload before `save()`. Runs after validation
   * passes, on **both** create and update. Pair with
   * `mutateDataBeforeCreate` / `mutateDataBeforeUpdate` for mode-specific
   * tweaks that layer on top.
   */
  mutateData(fn: MutateDataHandler): this {
    this._mutateData = fn
    return this
  }

  /** Create-only payload mutator. Runs after `mutateData` when `ctx.record` is undefined. */
  mutateDataBeforeCreate(fn: MutateDataHandler): this {
    this._mutateDataBeforeCreate = fn
    return this
  }

  /** Update-only payload mutator. Runs after `mutateData` when `ctx.record` is set. */
  mutateDataBeforeUpdate(fn: MutateDataHandler): this {
    this._mutateDataBeforeUpdate = fn
    return this
  }

  beforeSave(fn: LifecycleHandler<R>): this { this._beforeSave = fn; return this }

  /** Create-only pre-save hook. Runs after `beforeSave` when `ctx.record` is undefined. */
  beforeCreate(fn: LifecycleHandler<R>): this { this._beforeCreate = fn; return this }

  /** Update-only pre-save hook. Runs after `beforeSave` when `ctx.record` is set. */
  beforeUpdate(fn: LifecycleHandler<R>): this { this._beforeUpdate = fn; return this }

  /**
   * Persistence handler. Required for any form that accepts submits. No
   * default implementation — Phase 3 ships an ORM adapter via
   * `Resource.model`.
   */
  save(fn: SaveHandler<R>): this { this._save = fn; return this }

  /**
   * Create-only persistence override. Replaces `save()` for create mode.
   * Use when create and update need distinct persistence paths (e.g.
   * `Article.create(...)` vs `Article.update(id, ...)`).
   */
  handleCreate(fn: SaveHandler<R>): this { this._handleCreate = fn; return this }

  /** Update-only persistence override. Replaces `save()` for update mode. */
  handleUpdate(fn: SaveHandler<R>): this { this._handleUpdate = fn; return this }

  afterSave(fn: AfterSaveHandler<R>): this { this._afterSave = fn; return this }

  /** Create-only post-save hook. Runs after `afterSave` when `ctx.record` was undefined. */
  afterCreate(fn: AfterSaveHandler<R>): this { this._afterCreate = fn; return this }

  /** Update-only post-save hook. Runs after `afterSave` when `ctx.record` was set. */
  afterUpdate(fn: AfterSaveHandler<R>): this { this._afterUpdate = fn; return this }

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

  /** Transform values BEFORE `fillFromRecord` runs. Edit mode only. */
  mutateFormDataBeforeFill(fn: FillMutator<R>): this {
    this._mutateFormDataBeforeFill = fn
    return this
  }

  /** Transform values AFTER `fillFromRecord` runs. Edit mode only. */
  mutateFormDataAfterFill(fn: FillMutator<R>): this {
    this._mutateFormDataAfterFill = fn
    return this
  }

  /** Load a record by id for edit mode. */
  loadRecord(fn: LoadRecordHandler<R>): this {
    this._loadRecord = fn
    return this
  }

  /**
   * Notification fired after a successful save (both modes). Pass a string
   * for a default success toast with that title, a fully-built
   * `Notification`/meta, or a function that builds one from the saved
   * record. Pass `null` to suppress the framework's default toast for
   * this mode.
   */
  savedNotification(spec: SavedNotificationHandler<R>): this {
    this._savedNotification = spec
    return this
  }

  /** Create-only notification override. Falls back to `savedNotification` if unset. */
  createdNotification(spec: SavedNotificationHandler<R>): this {
    this._createdNotification = spec
    return this
  }

  /** Disable the success toast entirely (both modes). */
  disableSavedNotification(): this {
    this._savedNotificationDisabled = true
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
  getMutateDataBeforeCreate(): MutateDataHandler | undefined { return this._mutateDataBeforeCreate }
  getMutateDataBeforeUpdate(): MutateDataHandler | undefined { return this._mutateDataBeforeUpdate }
  getBeforeSave(): LifecycleHandler<R> | undefined { return this._beforeSave }
  getBeforeCreate(): LifecycleHandler<R> | undefined { return this._beforeCreate }
  getBeforeUpdate(): LifecycleHandler<R> | undefined { return this._beforeUpdate }
  getSave(): SaveHandler<R> | undefined { return this._save }
  getHandleCreate(): SaveHandler<R> | undefined { return this._handleCreate }
  getHandleUpdate(): SaveHandler<R> | undefined { return this._handleUpdate }
  getAfterSave(): AfterSaveHandler<R> | undefined { return this._afterSave }
  getAfterCreate(): AfterSaveHandler<R> | undefined { return this._afterCreate }
  getAfterUpdate(): AfterSaveHandler<R> | undefined { return this._afterUpdate }
  getRedirectAfterSave(): RedirectHandler<R> | undefined { return this._redirectAfterSave }
  getFillFromRecord(): FillFromRecordHandler<R> | undefined { return this._fillFromRecord }
  getMutateFormDataBeforeFill(): FillMutator<R> | undefined { return this._mutateFormDataBeforeFill }
  getMutateFormDataAfterFill(): FillMutator<R> | undefined { return this._mutateFormDataAfterFill }
  getLoadRecord(): LoadRecordHandler<R> | undefined { return this._loadRecord }
  getSavedNotification(): SavedNotificationHandler<R> | null | undefined { return this._savedNotification }
  getCreatedNotification(): SavedNotificationHandler<R> | null | undefined { return this._createdNotification }
  isSavedNotificationDisabled(): boolean { return this._savedNotificationDisabled }

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
