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
  /** When true, the rendered input gets the HTML `autofocus` attribute. */
  autofocus?:   boolean
  /**
   * Render the label as `sr-only` — visually hidden but kept in the DOM
   * for screen readers. Distinct from omitting the label entirely (which
   * loses the accessibility hook).
   */
  hiddenLabel?: boolean
  /**
   * Pass-through HTML attrs for the field's outer wrapper (the `flex
   * flex-col` container in `FieldShell` — the same node that hosts the
   * label + input + helper).
   */
  extraAttributes?:             Record<string, string | number | boolean>
  /** Pass-through HTML attrs for the underlying `<input>` / `<select>` / etc. */
  extraInputAttributes?:        Record<string, string | number | boolean>
  /** Alias for `extraAttributes`. Filament-parity name kept for clarity. */
  extraFieldWrapperAttributes?: Record<string, string | number | boolean>
  /**
   * Plan #5 reactive flag. When set, the client wires up a roundtrip
   * to the form's `stateUrl` on change/blur. Bare `true` means "fire
   * immediately on every change"; the object form carries debounce /
   * onBlur sub-options.
   */
  live?:        true | LiveOptions
  /**
   * Client-side reactivity hook. String body of a function bound with
   * `$state` (the changed field's new value), `$get(name)`, and
   * `$set(name, value)`. Compiled and run on the client on every change
   * — independent of `live()`. Treated as admin-trusted code; CSP
   * `unsafe-eval` is required. See `docs/plans/after-state-updated-js.md`.
   */
  afterStateUpdatedJs?: string
  /** Plan #6 cross-field plumbing. */
  prefix?:      FieldDecoration
  suffix?:      FieldDecoration
  helperText?:  string
  /** Caption rendered above the label (Filament parity). */
  aboveLabel?:  string
  /** Caption rendered below the label, above the input (Filament parity). */
  belowLabel?:  string
  /**
   * Render the label to the left of the input rather than above it.
   * Mirrors `Entry.inlineLabel()` for cross-surface symmetry — same flag
   * shape, same default (label-above) when omitted.
   */
  inlineLabel?: boolean
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
  /**
   * Per-field collab override. Absent = inherit the panel-wide default
   * (collab on every record-edit page when `@pilotiq-pro/collab` is
   * registered). Explicit `false` opts THIS field out of the collab
   * layer entirely — no value sync AND no presence chip — so the field
   * stays device-local inside an otherwise collab-on form. Useful for
   * sensitive scratch space or fields whose LWW semantics would
   * surprise users (rapid typing in plain-text inputs). Forward-compat
   * for `true` (opt in even when panel default is off) once
   * panel-level disable lands.
   */
  collab?: boolean
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
 * Submit-time transform passed to `Field.dehydrateStateUsing(fn)`. Receives
 * the field's already-coerced value plus `{ record?, values }` and returns
 * the value that should land in the persisted payload. `values` is the
 * surrounding values map — the full form data for top-level fields, the
 * row's own data inside a Repeater / Builder row. May be async.
 */
export type DehydrateStateUsingHandler = (
  value: unknown,
  ctx:   { record?: unknown; values: Record<string, unknown> },
) => unknown | Promise<unknown>

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
  // Client-side counterpart to `_afterStateUpdated`. Raw JS string;
  // compiled + executed on the client on every change. Empty string clears.
  protected _afterStateUpdatedJs?: string

  // Plan #6 cross-field plumbing. All optional, all serialized only when set.
  protected _prefix?: FieldDecoration
  protected _suffix?: FieldDecoration
  protected _helperText?: string
  protected _aboveLabel?: string
  protected _belowLabel?: string
  protected _inlineLabel?: boolean
  protected _default?: unknown
  protected _dehydrated = true
  protected _formatStateUsing?: FormatStateUsingHandler
  protected _dehydrateStateUsing?: DehydrateStateUsingHandler
  // Cross-row uniqueness flag. Only consulted by `validateRepeater` and
  // `validateBuilder`; a no-op outside an array-row context.
  protected _distinct?: DistinctOptions

  // Disable options already picked in sibling Repeater/Builder rows. Only
  // consulted by option-bearing subclasses (Select / Radio / CheckboxList /
  // ToggleButtons) inside their `toMeta` — a no-op everywhere else.
  protected _disableOptionsWhenSelectedInSiblings = false

  // Filament-parity micro-additions. All optional, all serialized only when set.
  protected _autofocus = false
  protected _hiddenLabel = false
  protected _validationAttribute?: string
  protected _extraAttributes?:             Record<string, string | number | boolean>
  protected _extraInputAttributes?:        Record<string, string | number | boolean>
  protected _extraFieldWrapperAttributes?: Record<string, string | number | boolean>

  // Operation-aware shortcuts. Each entry is `'table' | 'create' | 'edit' | 'view'`;
  // resolved against `RenderContext.mode` by `isHiddenIn / isDisabledIn`.
  // `disabledOn(['edit'])` reads as "disabled when the page mode is edit".
  protected _disabledOn?: ReadonlyArray<'table' | 'create' | 'edit' | 'view'>
  protected _hiddenOn?:   ReadonlyArray<'table' | 'create' | 'edit' | 'view'>
  protected _visibleOn?:  ReadonlyArray<'table' | 'create' | 'edit' | 'view'>

  // Per-field collab override. `undefined` = inherit panel default;
  // explicit `false` = opt out of value sync AND presence entirely.
  protected _collab?: boolean

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

  /**
   * Render the input with the HTML `autofocus` attribute. The browser
   * focuses the first matching control on initial paint; on SPA-nav the
   * renderer uses a `useEffect` fallback so the focus still lands.
   */
  autofocus(v = true): this { this._autofocus = v; return this }

  /**
   * Render the label as `sr-only` — visually hidden but kept for screen
   * readers. Use for inputs whose context already names them (e.g. a
   * search bar in a table header). Distinct from omitting the label.
   */
  hiddenLabel(v = true): this { this._hiddenLabel = v; return this }

  /**
   * Override the name used in default validation messages. Filament
   * parity: `validationAttribute('email address')` makes the auto-required
   * message read "The email address is required" instead of "This field
   * is required". Only consulted by the implicit-required check; explicit
   * validators with a `message` argument keep their text.
   */
  validationAttribute(label: string): this { this._validationAttribute = label; return this }

  /** Pass-through HTML attrs spread on the field's outer wrapper. */
  extraAttributes(attrs: Record<string, string | number | boolean>): this {
    this._extraAttributes = attrs
    return this
  }

  /** Pass-through HTML attrs spread on the underlying `<input>` / `<select>` / etc. */
  extraInputAttributes(attrs: Record<string, string | number | boolean>): this {
    this._extraInputAttributes = attrs
    return this
  }

  /** Filament-parity alias for `extraAttributes` — same outer-wrapper target. */
  extraFieldWrapperAttributes(attrs: Record<string, string | number | boolean>): this {
    this._extraFieldWrapperAttributes = attrs
    return this
  }

  // ─── Visibility flags ─────────────────────────────────

  hideFromTable(v = true):  this { this._hideFromTable  = v; return this }
  hideFromCreate(v = true): this { this._hideFromCreate = v; return this }
  hideFromEdit(v = true):   this { this._hideFromEdit   = v; return this }
  hideFromView(v = true):   this { this._hideFromView   = v; return this }

  /**
   * Disable the input only on the listed page modes. Sugar over
   * `disabledWhen(({ ctx }) => …)` for the common case. Composes with
   * `readonly()` and `disabledWhen()` — any path returning true wins.
   */
  disabledOn(modes: ReadonlyArray<'table' | 'create' | 'edit' | 'view'>): this {
    this._disabledOn = modes
    return this
  }

  /**
   * Hide the field only on the listed page modes. Distinct from the
   * existing `hideFromCreate / hideFromEdit / …` flags — accepts a list
   * so `hiddenOn(['create', 'view'])` reads in one line.
   */
  hiddenOn(modes: ReadonlyArray<'table' | 'create' | 'edit' | 'view'>): this {
    this._hiddenOn = modes
    return this
  }

  /**
   * Inverse of `hiddenOn` — show only on the listed page modes. The
   * `mode === undefined` case (custom Pages, schema-only routes) keeps
   * the field visible to match `hideFromX`'s no-op posture there.
   */
  visibleOn(modes: ReadonlyArray<'table' | 'create' | 'edit' | 'view'>): this {
    this._visibleOn = modes
    return this
  }

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

  /**
   * Client-side reactivity hook. The string is compiled into a function
   * `(($state, $get, $set) => { …body… })` on the client and run
   * synchronously on every change — independent of `live()` (no server
   * roundtrip required). Use `$set('other', value)` to populate
   * dependent fields instantly.
   *
   * Treated as admin-trusted code: written at schema-definition time,
   * never derived from request input. CSP `unsafe-eval` is required;
   * apps with strict CSPs see the eval fail at runtime (caught + logged,
   * field stays usable).
   *
   * Pass `''` (empty string) to clear. Composes with the server hook
   * `afterStateUpdated()`: JS runs first synchronously; the server's
   * response on the next `live()` roundtrip overlays it.
   */
  afterStateUpdatedJs(body: string): this {
    if (body === '') { delete this._afterStateUpdatedJs; return this }
    this._afterStateUpdatedJs = body
    return this
  }

  /** Whether this field is configured to trigger live re-resolves. */
  isLive(): boolean { return this._live !== undefined }
  getLiveOptions(): true | LiveOptions | undefined { return this._live }
  getAfterStateUpdated(): AfterStateUpdatedHandler | undefined { return this._afterStateUpdated }
  getAfterStateUpdatedJs(): string | undefined { return this._afterStateUpdatedJs }

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
   * Caption rendered above the field's label (Filament idiom). Muted
   * small text — use for section-style context that should read before
   * the label ("Step 2 of 3", "Optional"). v1 accepts a plain string.
   */
  aboveLabel(text: string): this { this._aboveLabel = text; return this }

  /**
   * Caption rendered below the field's label, above the input (Filament
   * idiom). Sits closer to the label than `helperText` (which renders
   * under the input) — use for instructions users should read BEFORE
   * interacting with the control. v1 accepts a plain string.
   */
  belowLabel(text: string): this { this._belowLabel = text; return this }

  /**
   * Render the label to the left of the input rather than above it.
   * Mirrors `Entry.inlineLabel()`. Default is label-above; pass `false`
   * to clear the flag — including overriding a cascading default set
   * via `Form.inlineLabel()` / `Section.inlineLabel()`.
   *
   * Resolution at meta-build time: explicit field setting wins; when
   * unset, the nearest ancestor `Form` / `Section` cascade kicks in
   * (`RenderContext.inlineLabelDefault`); when neither is set, label-above.
   */
  inlineLabel(v = true): this { this._inlineLabel = v; return this }

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
   * Per-field realtime-collab override.
   *
   * - `.collab(false)` — opts THIS field out of the collab layer
   *   entirely (no value sync via the form-level CRDT, no presence
   *   chip rendered next to the label). The field stays device-local
   *   inside an otherwise collab-on form. Useful for private scratch
   *   space or fields whose LWW semantics would surprise users
   *   (rapid typing in plain-text inputs hit the v1 last-writer-wins
   *   footgun — `.collab(false)` is the v1 escape hatch).
   * - `.collab(true)` (default of the bare call) — explicit opt-in.
   *   Forward-compat for a future panel-level disable; today it
   *   behaves the same as not calling the setter when collab is
   *   already on at the panel level.
   * - Not calling the setter — inherits the panel-wide default
   *   (collab on whenever `.plugins([collab()])` is registered).
   */
  collab(enabled = true): this {
    this._collab = enabled
    return this
  }

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
   * Submit-time counterpart to `formatStateUsing` — transform the field's
   * value before it enters the persisted payload. Runs AFTER type coercion
   * (booleans / numbers / Dates are already real) and BEFORE the form-level
   * `mutateData` hook, so the form hook sees the final per-field shape.
   * Classic use: `ToggleField.make('active').dehydrateStateUsing(v => v ? 1 : 0)`
   * for an integer column the ORM doesn't cast.
   *
   * Applies inside Repeater / Builder rows too (each row's value transforms
   * independently; `ctx.values` is the row's own data there). Skipped when
   * the field is `dehydrated(false)` (the value never reaches the payload)
   * and when the field's key is absent from the submitted body. May be async.
   */
  dehydrateStateUsing(fn: DehydrateStateUsingHandler): this {
    this._dehydrateStateUsing = fn
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

  /**
   * Inside a Repeater / Builder, grey out option choices that another row
   * has already picked. Auto-enables `distinct()` (server-side cross-row
   * uniqueness as a last-line guarantee) and `live()` (so picking a value
   * in one row immediately re-resolves the others).
   *
   * Pass `false` to clear the flag — calling `distinct(false) / live(false)`
   * separately afterwards is up to you, this method only re-arms them when
   * enabling. Outside an array-row context the flag is a no-op (the
   * resolver only stamps `ctx.row.siblings` inside Repeater/Builder rows).
   *
   * Builder scoping is per-block-type: a `Select`'s "taken" values come
   * only from sibling rows whose `type` matches the current row's block
   * (otherwise picks across heterogeneous blocks would falsely conflict).
   *
   * Implemented on `Field` so the flag carries through to every subclass,
   * but only `SelectField / RadioField / CheckboxListField /
   * ToggleButtonsField` consume it inside their `toMeta` (other field
   * types have no option list to disable).
   */
  disableOptionsWhenSelectedInSiblingRepeaterItems(value: boolean = true): this {
    if (value === false) {
      this._disableOptionsWhenSelectedInSiblings = false
      return this
    }
    this._disableOptionsWhenSelectedInSiblings = true
    this.distinct()
    this.live()
    return this
  }

  shouldDisableOptionsTakenInSiblings(): boolean {
    return this._disableOptionsWhenSelectedInSiblings
  }

  isDehydrated(): boolean { return this._dehydrated }
  getDefault(): unknown { return this._default }
  getPrefix(): FieldDecoration | undefined { return this._prefix }
  getSuffix(): FieldDecoration | undefined { return this._suffix }
  getHelperText(): string | undefined { return this._helperText }
  getAboveLabel(): string | undefined { return this._aboveLabel }
  getBelowLabel(): string | undefined { return this._belowLabel }
  getFormatStateUsing(): FormatStateUsingHandler | undefined { return this._formatStateUsing }
  getDehydrateStateUsing(): DehydrateStateUsingHandler | undefined { return this._dehydrateStateUsing }

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
    if (mode !== undefined) {
      if (this._hiddenOn  && this._hiddenOn.includes(mode))  return true
      if (this._visibleOn && !this._visibleOn.includes(mode)) return true
    }
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
    const mode = ctx?.mode
    if (mode !== undefined && this._disabledOn && this._disabledOn.includes(mode)) return true
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
      // `[]` / `'[]'` — array-valued fields (multi-select, TagsInput)
      // post a JSON-encoded array through a single hidden input, and
      // validation runs BEFORE coercion. Same emptiness contract as
      // the `required()` rule in `validation/rules.ts`.
      const empty = value === undefined || value === null || value === ''
        || (Array.isArray(value) && value.length === 0)
        || value === '[]'
      if (empty) {
        errors.push(this.requiredMessage())
      }
    }

    for (const v of this._validators) {
      const result = await v(value, ctx)
      if (result) errors.push(result)
    }
    return errors
  }

  /**
   * Default-required error text. When `validationAttribute()` is set,
   * substitutes the attribute into a human message — "The email address
   * is required" — otherwise falls back to the legacy generic phrasing
   * so existing tests + UI strings keep matching.
   */
  private requiredMessage(): string {
    return this._validationAttribute
      ? `The ${this._validationAttribute} is required`
      : 'This field is required'
  }

  private hasRequiredValidator(): boolean {
    return this._validators.some(v => v.serialized?.rule === 'required')
  }

  /** Serialized rule descriptors mirrored to the client. */
  protected getSerializedRules(): SerializedRule[] {
    const rules: SerializedRule[] = []
    if (this._required && !this.hasRequiredValidator()) {
      rules.push({ rule: 'required', message: this.requiredMessage() })
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
      ...(this._afterStateUpdatedJs !== undefined ? { afterStateUpdatedJs: this._afterStateUpdatedJs } : {}),
      ...(this._prefix !== undefined ? { prefix: this._prefix } : {}),
      ...(this._suffix !== undefined ? { suffix: this._suffix } : {}),
      ...(this._helperText !== undefined ? { helperText: this._helperText } : {}),
      ...(this._aboveLabel !== undefined ? { aboveLabel: this._aboveLabel } : {}),
      ...(this._belowLabel !== undefined ? { belowLabel: this._belowLabel } : {}),
      ...(this._inlineLabel === true || (this._inlineLabel === undefined && ctx?.inlineLabelDefault === true) ? { inlineLabel: true } : {}),
      ...(this._default !== undefined ? { defaultValue: this._default } : {}),
      ...(formattedValue !== undefined ? { formattedValue } : {}),
      ...(this._autofocus ? { autofocus: true } : {}),
      ...(this._hiddenLabel ? { hiddenLabel: true } : {}),
      ...(this._extraAttributes !== undefined ? { extraAttributes: this._extraAttributes } : {}),
      ...(this._extraInputAttributes !== undefined ? { extraInputAttributes: this._extraInputAttributes } : {}),
      ...(this._extraFieldWrapperAttributes !== undefined ? { extraFieldWrapperAttributes: this._extraFieldWrapperAttributes } : {}),
      ...(this._collab    !== undefined ? { collab:    this._collab }    : {}),
    }
  }

  override toMeta(ctx?: RenderContext): FieldMeta | Promise<FieldMeta> {
    return this.buildMeta(ctx)
  }
}
