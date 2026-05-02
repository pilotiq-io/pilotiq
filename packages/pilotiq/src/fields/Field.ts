import { Element, type ElementMeta } from '../schema/Element.js'
import type { RenderContext } from '../schema/resolveSchema.js'
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
/**
 * Live-update options. `onBlur:true` defers the trigger until the input
 * loses focus; `debounce:N` waits `N`ms of idle after the last change.
 * They compose — `{ onBlur: true, debounce: 500 }` waits 500ms after blur.
 *
 * Serialized verbatim onto `FieldMeta.live`; the client uses it to decide
 * how to wire each field's `onChange` / `onBlur` handler.
 */
export interface LiveOptions {
  onBlur?:   boolean
  debounce?: number
}

/**
 * Decoration content for `Field.prefix()` / `Field.suffix()`. Either a
 * literal string (e.g. `"$"`, `".com"`) or an icon descriptor mirroring
 * the icon system (`{ icon: 'name' }` looks up the registry; `{ icon:
 * Component }` ships the class identity for the renderer to resolve at
 * render time).
 */
export type FieldDecoration = string | { icon: string }

export interface FieldMeta extends ElementMeta {
  type:         'field'
  fieldType:    FieldType
  name:         string
  label:        string
  required:     boolean
  disabled:     boolean
  placeholder?: string
  rules?:       SerializedRule[]
  /**
   * Plan #5 reactive flag. When set, the client wires up a roundtrip
   * to the form's `stateUrl` on change/blur. Bare `true` means "fire
   * immediately on every change"; the object form carries debounce /
   * onBlur sub-options.
   */
  live?:        true | LiveOptions
  /** Plan #6 cross-field plumbing. */
  prefix?:      FieldDecoration
  suffix?:      FieldDecoration
  helperText?:  string
  /**
   * Default value for create-mode (no record). Display-time wins over
   * this when a record / values map is present (see `renderFormChild`
   * — values from the form state override meta defaults).
   */
  defaultValue?: unknown
  /**
   * Result of `formatStateUsing(fn)` evaluated at meta-build. Renderers
   * prefer this over the raw value when present (mirrors
   * `Column.formatStateUsing` from Plan #2).
   */
  formattedValue?: string
}

/**
 * Context passed to `showWhen` / `hideWhen` / `disabledWhen` callbacks.
 * Plan #5 widened these from `(record) => bool` to `(ctx) => bool` so
 * conditions can read sibling values via `$get`. Existing code that
 * destructures `record` keeps working: `({ record }) => …`. Plain
 * `record => record.foo` callers must migrate to the destructure form.
 */
export interface ConditionContext {
  record?: unknown
  values?: Record<string, unknown>
  $get?:   (name: string) => unknown
  $set?:   (name: string, value: unknown) => void
  user?:   unknown
  /**
   * Plan #14 row-scoped sugar inside a Repeater. Mirrors `RenderContext.row`
   * — present only when this field is being resolved as part of a Repeater
   * row's inner schema. `row.$get / $set` read the row's local values map
   * (same as `ctx.$get / $set` in this scope); `row.index` is the row's
   * position. Use it for clarity at call sites that want to be explicit
   * about row-scoping.
   */
  row?: {
    index: number
    $get:  (name: string) => unknown
    $set:  (name: string, value: unknown) => void
  }
}

export type FieldCondition = (ctx: ConditionContext) => boolean

/**
 * Server-side hook fired when a `live()` field's value changes. Receives
 * the new value and a context bag with helpers for reading/writing
 * sibling fields. Async — pilotiq awaits it before re-resolving the
 * form schema for the response.
 */
export type AfterStateUpdatedContext = {
  $get: (name: string) => unknown
  $set: (name: string, value: unknown) => void
  record?: unknown
  user?:   unknown
  request?: unknown
  values:  Record<string, unknown>
  /**
   * Plan #14 — present only when the field is inside a Repeater or
   * Builder row. `$get` / `$set` are row-scoped (mirroring the
   * resolve-time `$get` inside a row); cross-row reads / writes go
   * through the parent `$get / $set` with a dotted path
   * (`items.0.quantity` or `content.0.data.heading`).
   *
   * `blockType` is set only for Builder rows — the discriminator picks
   * which block schema is active. Undefined inside Repeater rows
   * (homogeneous schema, single inner type).
   */
  row?: {
    index:     number
    blockType?: string
    $get:      (name: string) => unknown
    $set:      (name: string, value: unknown) => void
  }
}

export type AfterStateUpdatedHandler = (
  value: unknown,
  ctx:   AfterStateUpdatedContext,
) => void | Promise<void>

/**
 * Display-time transform passed to `Field.formatStateUsing(fn)`. Receives
 * the resolved value plus the record context, returns the string that
 * the renderer should display. Parallel to `Column.formatStateUsing` so
 * the same shape applies in tables and forms.
 */
export type FormatStateUsingHandler = (
  value: unknown,
  ctx:   { record?: unknown },
) => string

/**
 * Configuration for `Field.distinct()` — cross-row uniqueness inside a
 * Repeater or Builder. Outside an array-row context the flag is a no-op
 * (validators run per row's local values map; cross-row comparisons are
 * the array-field validator's job).
 *
 * - `caseInsensitive` (default `false`): case-fold strings before
 *   comparing. Non-string values are compared as-is.
 * - `ignoreNulls` (default `true`): treat `null / undefined / ''` as
 *   "not yet set" and skip them — two empty rows aren't a conflict by
 *   default. Pass `false` to forbid duplicate empties too.
 * - `message` (default `'Must be unique'`): override the rejection text.
 */
export interface DistinctOptions {
  caseInsensitive?: boolean
  ignoreNulls?:     boolean
  message?:         string
}

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

  // Plan #5 reactive plumbing. `_live` undefined → field doesn't trigger
  // re-resolves; `true` → fire on every change; object → onBlur/debounce.
  // `_afterStateUpdated` runs server-side after the changed field's value
  // is applied but before the schema is re-resolved.
  protected _live?: true | LiveOptions
  protected _afterStateUpdated?: AfterStateUpdatedHandler

  // Plan #6 cross-field plumbing. All optional, all serialized only when set.
  protected _prefix?: FieldDecoration
  protected _suffix?: FieldDecoration
  protected _helperText?: string
  protected _default?: unknown
  protected _dehydrated = true
  protected _formatStateUsing?: FormatStateUsingHandler
  // Cross-row uniqueness flag. Only consulted by `validateRepeater` and
  // `validateBuilder`; a no-op outside an array-row context.
  protected _distinct?: DistinctOptions

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

  // ─── Reactivity (Plan #5) ─────────────────────────────

  /**
   * Mark this field as a re-resolve trigger. With no opts, the form
   * roundtrips on every change. Pass `{ onBlur: true }` to wait for
   * blur, `{ debounce: 500 }` to wait 500ms of idle, or both. Calling
   * `live(false)` clears the flag.
   */
  live(opts?: boolean | LiveOptions): this {
    if (opts === false) { delete this._live; return this }
    if (opts === undefined || opts === true) { this._live = true; return this }
    this._live = opts
    return this
  }

  /**
   * Server-side hook called when this field's value changes during a
   * partial-resolve roundtrip. Receives the new value and `{ $get, $set,
   * record, user, request, values }`. Use `$set` to populate dependent
   * fields (e.g. slug from title). Async; thrown errors fail the
   * roundtrip and surface a toast on the client.
   */
  afterStateUpdated(fn: AfterStateUpdatedHandler): this {
    this._afterStateUpdated = fn
    return this
  }

  /** Whether this field is configured to trigger live re-resolves. */
  isLive(): boolean { return this._live !== undefined }
  getLiveOptions(): true | LiveOptions | undefined { return this._live }
  getAfterStateUpdated(): AfterStateUpdatedHandler | undefined { return this._afterStateUpdated }

  // ─── Cross-field plumbing (Plan #6) ───────────────────

  /**
   * Decoration before the input — currency mark, protocol, etc. Pass a
   * plain string for text or `{ icon: 'name' }` to use the icon registry.
   * Serialized verbatim onto `FieldMeta.prefix`.
   */
  prefix(content: FieldDecoration): this { this._prefix = content; return this }

  /** Decoration after the input — domain suffix, unit, etc. */
  suffix(content: FieldDecoration): this { this._suffix = content; return this }

  /** Helper text rendered below the input — typically a constraint hint. */
  helperText(text: string): this { this._helperText = text; return this }

  /**
   * Default value for create-mode (no record). On edit, the loaded
   * record's value wins. Stored opaquely; the renderer reads it via
   * `FieldMeta.defaultValue`.
   */
  default(value: unknown): this { this._default = value; return this }

  /**
   * Toggle whether this field round-trips its value on submit. Default
   * `true` (dehydrated — value is included in the POST body). Pass
   * `false` for purely-display fields, computed values, or wizard
   * scratch state. Dehydrated-false fields are filtered out by
   * `coerceFormValues` before validation runs.
   */
  dehydrated(value: boolean = true): this { this._dehydrated = value; return this }

  /**
   * Display-time transform — receives `(value, { record })` and returns
   * a string. Result lands on `FieldMeta.formattedValue`; renderers
   * prefer it over the raw value when present. Parallels
   * `Column.formatStateUsing` from Plan #2.
   */
  formatStateUsing(fn: FormatStateUsingHandler): this {
    this._formatStateUsing = fn
    return this
  }

  /**
   * Cross-row uniqueness inside a Repeater / Builder. When the field is
   * resolved in a row context, every row's value is compared against
   * earlier rows; the second + subsequent occurrences fail validation.
   *
   * Pass `false` (or `distinct(false)`) to clear the flag. Pass an options
   * object for `caseInsensitive / ignoreNulls / message` (see
   * `DistinctOptions`). Bare `distinct()` is the common case — exact
   * comparison, empty values ignored, default message.
   *
   * Outside an array-row context this flag is a no-op (`validateSchema`
   * never reads it directly — only `validateRepeater / validateBuilder`
   * do, and those have access to the full row array). Pair with
   * `unique({ model })` if you also need DB-level uniqueness across all
   * records.
   */
  distinct(opts?: boolean | DistinctOptions): this {
    if (opts === false) { delete this._distinct; return this }
    if (opts === undefined || opts === true) { this._distinct = {}; return this }
    this._distinct = opts
    return this
  }

  getDistinct(): DistinctOptions | undefined { return this._distinct }

  isDehydrated(): boolean { return this._dehydrated }
  getDefault(): unknown { return this._default }
  getPrefix(): FieldDecoration | undefined { return this._prefix }
  getSuffix(): FieldDecoration | undefined { return this._suffix }
  getHelperText(): string | undefined { return this._helperText }
  getFormatStateUsing(): FormatStateUsingHandler | undefined { return this._formatStateUsing }

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
   * current context. Combines the `_hideFromMode` flags (when `ctx.mode` is
   * set) and the `showWhen` / `hideWhen` callbacks (when `ctx.record` or
   * `ctx.values` is present).
   *
   * Plan #5: condition callbacks receive a `ConditionContext` carrying
   * record, values, $get, $set, user. They still fire only when there's
   * something to look at — record in non-create modes, or values when
   * the form has been edited.
   */
  isHiddenIn(ctx?: RenderContext): boolean {
    const mode = ctx?.mode
    if (mode === 'table'  && this._hideFromTable)  return true
    if (mode === 'create' && this._hideFromCreate) return true
    if (mode === 'edit'   && this._hideFromEdit)   return true
    if (mode === 'view'   && this._hideFromView)   return true
    if (this._showWhen || this._hideWhen) {
      const condCtx = this.buildConditionContext(ctx)
      if (condCtx) {
        if (this._showWhen && !this._showWhen(condCtx)) return true
        if (this._hideWhen &&  this._hideWhen(condCtx)) return true
      }
    }
    return false
  }

  /**
   * Resolved disabled state — `true` if `readonly()` is set OR
   * `disabledWhen()` returns true for the current record/values.
   */
  isDisabledIn(ctx?: RenderContext): boolean {
    if (this._readonly) return true
    if (this._disabledWhen) {
      const condCtx = this.buildConditionContext(ctx)
      if (condCtx) return this._disabledWhen(condCtx)
    }
    return false
  }

  /**
   * Build the condition-callback ctx from the render ctx. Returns
   * undefined when there's no useful data to evaluate against (no
   * record AND no values) — saves callbacks from being asked
   * "should I show?" with nothing to look at, matching today's
   * "no record → skip" semantics. The resolver and partial-resolve
   * endpoint always pass either record or values, so user code never
   * needs to defensively check.
   */
  private buildConditionContext(ctx?: RenderContext): ConditionContext | undefined {
    if (!ctx) return undefined
    if (ctx.record === undefined && ctx.values === undefined) return undefined
    const condCtx: ConditionContext = {}
    if (ctx.record !== undefined) condCtx.record = ctx.record
    if (ctx.values !== undefined) condCtx.values = ctx.values
    if (ctx.$get) condCtx.$get = ctx.$get
    if (ctx.$set) condCtx.$set = ctx.$set
    if (ctx.user !== undefined) condCtx.user = ctx.user
    if (ctx.row   !== undefined) condCtx.row   = ctx.row
    return condCtx
  }

  /**
   * Run every validator against `value`, collecting all error messages in
   * declaration order. The `_required` flag implicitly contributes a
   * required check unless the validator list already includes one (matched
   * by `serialized.rule === 'required'`) — keeps `.required()` and
   * `.validate(required())` from double-firing.
   *
   * Async-aware: validators returning a `Promise<string | null>` (e.g.
   * `unique()` probing the DB) are awaited in declaration order. Errors
   * thrown by an async validator propagate to the caller — the pipeline
   * does NOT swallow them, since DB failures should surface as 500s
   * rather than silently invalidating the field.
   */
  async runValidators(value: unknown, ctx?: ValidatorContext): Promise<string[]> {
    const errors: string[] = []

    if (this._required && !this.hasRequiredValidator()) {
      if (value === undefined || value === null || value === '') {
        errors.push('This field is required')
      }
    }

    for (const v of this._validators) {
      const result = await v(value, ctx)
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
   * Disabled state is computed via `isDisabledIn(ctx)` — pass the current
   * `RenderContext` so `disabledWhen` evaluates correctly and reactive
   * subclasses (Plan #5) can read `values / $get`. Omit the ctx for
   * meta-only contexts (e.g. table cell rendering of an unbound field).
   */
  /**
   * Build the synchronous base meta object — type, fieldType, name,
   * label, required, disabled, placeholder, rules, live. Subclasses spread
   * the result to add their own keys. Kept sync (a separate protected
   * helper rather than `super.toMeta`) so async subclasses (Plan #5
   * `SelectField` with resolver-style options) can `const base =
   * this.buildMeta(ctx)` instead of having to handle a `FieldMeta |
   * Promise<FieldMeta>` union from `super.toMeta`.
   */
  protected buildMeta(ctx?: RenderContext): FieldMeta {
    const rules = this.getSerializedRules()

    // formatStateUsing: prefer the record-mapped value when available,
    // otherwise the seeded default. Skip entirely when no source value
    // exists — calling the formatter with `undefined` is rarely useful
    // and would force every formatter to defensively guard.
    let formattedValue: string | undefined
    if (this._formatStateUsing) {
      const recordValue = ctx?.record !== undefined && ctx.record !== null && typeof ctx.record === 'object'
        ? (ctx.record as Record<string, unknown>)[this.name]
        : undefined
      const valuesValue = ctx?.values?.[this.name]
      const sourceValue = valuesValue !== undefined ? valuesValue
        : recordValue !== undefined ? recordValue
        : this._default
      if (sourceValue !== undefined) {
        try {
          formattedValue = this._formatStateUsing(sourceValue, { record: ctx?.record })
        } catch (err) {
          console.warn(`[pilotiq] formatStateUsing for "${this.name}" threw:`, err)
        }
      }
    }

    return {
      type:        'field',
      fieldType:   this.fieldType,
      name:        this.name,
      label:       this._label,
      required:    this._required,
      disabled:    this.isDisabledIn(ctx),
      ...(this._placeholder ? { placeholder: this._placeholder } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(this._live !== undefined ? { live: this._live } : {}),
      ...(this._prefix !== undefined ? { prefix: this._prefix } : {}),
      ...(this._suffix !== undefined ? { suffix: this._suffix } : {}),
      ...(this._helperText !== undefined ? { helperText: this._helperText } : {}),
      ...(this._default !== undefined ? { defaultValue: this._default } : {}),
      ...(formattedValue !== undefined ? { formattedValue } : {}),
    }
  }

  override toMeta(ctx?: RenderContext): FieldMeta | Promise<FieldMeta> {
    return this.buildMeta(ctx)
  }
}
