import { Field, type FieldMeta } from './Field.js'
import {
  resolveOptions,
  disableOptionsTakenInSiblings,
  type OptionsResolver,
  type SelectOption,
} from './optionsResolver.js'
import type { Element, ElementMeta } from '../schema/Element.js'
import { resolveSchema, type RenderContext } from '../schema/resolveSchema.js'
import type {
  ActionVisibilityContext,
  VisibilityRule,
} from '../actions/Action.js'

// Re-export for back-compat — earlier code imported these directly from
// SelectField. New code should prefer `fields/optionsResolver.ts`.
export type { OptionsResolver, SelectOption }

/** The new option produced by `createOptionUsing(fn)`. Returns the
 *  `value` to post back to the parent form and the `label` to display
 *  in the option list. The handler is user-supplied — pilotiq does not
 *  auto-create against any model. */
export interface CreateOptionResult {
  value: string
  label: string
}

/** Server-side handler for `SelectField.createOptionUsing`. Receives the
 *  modal form's coerced + validated values and the parent form's
 *  RenderContext (so `ctx.user` etc. are available). Returns the new
 *  option synchronously or via Promise. Throwing surfaces as a 500 with
 *  the message in the response body. */
export type CreateOptionHandler = (
  values: Record<string, unknown>,
  ctx:    RenderContext,
) => CreateOptionResult | Promise<CreateOptionResult>

/** Wire-shape carried on `SelectFieldMeta.createOption` when the field
 *  has opted into inline create. `url` is filled in by
 *  `tagSelectCreateOptionUrls` at page-data time; absent when the field
 *  has no `createOptionForm` set or the authorize rule returned false. */
export interface CreateOptionMeta {
  /** Sub-form id, deterministic so the renderer can target it without a
   *  server round-trip. Format: `${parentFormId}_create-option_${fieldName}`,
   *  but the parent formId isn't known here — the field just emits a
   *  formId derived from its own name. The walker rewrites this when it
   *  has the parent in scope. */
  formId: string
  /** Resolved meta for the `createOptionForm` children. Same shape as
   *  any other element subtree on the wire. */
  schema: ElementMeta[]
  /** POST endpoint stamped by `tagSelectCreateOptionUrls` walker. When
   *  absent, the renderer skips mounting the "+" trigger (no endpoint
   *  configured for the parent's scope). */
  url?:   string
}

export class SelectField extends Field {
  private _options: SelectOption[] | OptionsResolver = []

  /** Element subtree that renders inside the inline-create modal.
   *  Resolved at meta-build time via `Promise.all(toMeta)` so dependent
   *  options and reactive visibility see the parent form's
   *  `RenderContext`. */
  private _createOptionForm?:      Element[]
  /** Server-side handler that returns the new option. Required when
   *  `createOptionForm` is set — meta-build throws otherwise to catch
   *  the configuration error early instead of at first click. */
  private _createOptionHandler?:   CreateOptionHandler
  /** Visibility rule for the "+" trigger. Default: visible. The
   *  endpoint re-evaluates the same rule server-side so a tampered
   *  client can't bypass. Does NOT auto-inherit any `Resource.canCreate` —
   *  the option being created is rarely the same model as the parent
   *  form's record. */
  private _createOptionAuthorize?: VisibilityRule
  /** POST endpoint stamped at page-data time by `tagSelectCreateOptionUrls`.
   *  Field-instance state (parallel to `Form.withStateUrl`); read by
   *  `toMeta` and emitted into the `createOption.url` slot. Absent ⇒ no
   *  walker has run yet ⇒ renderer skips the trigger. */
  private _createOptionUrl?: string

  private constructor(name: string) {
    super(name, 'select')
  }

  static make(name: string): SelectField {
    return new SelectField(name)
  }

  /**
   * Static option list, or a resolver function for dependent options.
   * The function form receives `{ $get, $set, record, user, values }`
   * and runs every resolve — server-canonical, so it's safe to read
   * from a database.
   */
  options(opts: SelectOption[] | OptionsResolver): this {
    this._options = opts
    return this
  }

  /**
   * Returns the static option array. Returns the empty array when
   * options are configured as a function — callers wanting the
   * resolved list should go through `toMeta(ctx)`.
   */
  getOptions(): SelectOption[] {
    return Array.isArray(this._options) ? this._options : []
  }

  /** Whether options are configured as a (potentially async) resolver. */
  hasDynamicOptions(): boolean {
    return typeof this._options === 'function'
  }

  /**
   * Inline create-option modal. When set, the rendered SelectField
   * grows a "+" trigger that opens a Dialog hosting the supplied
   * sub-form. Submitting POSTs to a scope-derived endpoint that runs
   * `createOptionUsing` and returns `{ value, label }` for the new
   * option. The new option is appended to the local options state and
   * selected; no parent-form roundtrip required.
   *
   * Pair with `createOptionUsing(fn)` — both are required for the
   * trigger to mount. Optionally gate visibility with
   * `createOptionAuthorize(rule)`.
   *
   * Two call shapes:
   * - Bare array: `createOptionForm([TextField.make('name'), …])`
   * - Builder fn: `createOptionForm(form => form.schema([…]))` —
   *   reserved; v1 accepts the array form only.
   */
  createOptionForm(elements: Element[]): this {
    this._createOptionForm = elements
    return this
  }

  /** Server-side handler called when the modal form submits. Receives
   *  coerced + validated values and the parent form's `RenderContext`.
   *  Returns the new `{ value, label }` option. Throwing surfaces as a
   *  500 to the modal — typical use is to wrap a model `.create()` and
   *  format a label. */
  createOptionUsing(handler: CreateOptionHandler): this {
    this._createOptionHandler = handler
    return this
  }

  /** Visibility gate on the "+" trigger. Same shape as
   *  `Action.visible / .authorize`. Default: visible. Server re-runs
   *  the same predicate so URL access can't bypass. */
  createOptionAuthorize(rule: VisibilityRule): this {
    this._createOptionAuthorize = rule
    return this
  }

  /** True when the field has opted into inline create. */
  hasCreateOption(): boolean {
    return this._createOptionForm !== undefined
  }

  /** Internal accessor used by the route handler at request time. */
  getCreateOptionForm(): Element[] | undefined { return this._createOptionForm }
  getCreateOptionHandler(): CreateOptionHandler | undefined { return this._createOptionHandler }
  getCreateOptionAuthorize(): VisibilityRule | undefined { return this._createOptionAuthorize }

  /** Stamped by `tagSelectCreateOptionUrls` at page-data time. Mirrors
   *  the `Form.withStateUrl` / `Table.withReorderUrl` pattern. */
  withCreateOptionUrl(url: string): this {
    this._createOptionUrl = url
    return this
  }
  getCreateOptionUrl(): string | undefined { return this._createOptionUrl }

  override async toMeta(ctx?: RenderContext): Promise<FieldMeta & { options: SelectOption[]; createOption?: CreateOptionMeta }> {
    const base    = this.buildMeta(ctx)
    const options = disableOptionsTakenInSiblings(
      await resolveOptions(this._options, ctx, this.name),
      this.shouldDisableOptionsTakenInSiblings(),
      this.name,
      ctx,
    )

    const createOption = await this.buildCreateOptionMeta(ctx)

    return {
      ...base,
      options,
      ...(createOption ? { createOption } : {}),
    }
  }

  /** Resolve the createOption slot. Returns undefined when not
   *  configured OR when the authorize rule rejects. Throws when the
   *  form is set without a handler — caught at meta-build to surface
   *  the config error during dev rather than at first click. */
  private async buildCreateOptionMeta(ctx?: RenderContext): Promise<CreateOptionMeta | undefined> {
    if (this._createOptionForm === undefined) return undefined
    if (this._createOptionHandler === undefined) {
      throw new Error(
        `SelectField '${this.name}': createOptionForm() requires createOptionUsing(handler) to be set. ` +
        `Without a handler the modal submit has no destination.`
      )
    }

    const visible = await evalCreateOptionAuthorize(this._createOptionAuthorize, ctx)
    if (!visible) return undefined

    const schema = await resolveSchema(this._createOptionForm, ctx ?? {})

    return {
      formId: `${this.name}_create-option`,
      schema,
      ...(this._createOptionUrl !== undefined ? { url: this._createOptionUrl } : {}),
    }
  }
}

/** Evaluate the authorize rule. Mirrors `Action.evaluate` posture — a
 *  thrown rule is treated as fail-CLOSED (visible: false) so an
 *  in-progress predicate change can't accidentally expose the trigger. */
async function evalCreateOptionAuthorize(
  rule: VisibilityRule | undefined,
  ctx:  RenderContext | undefined,
): Promise<boolean> {
  if (rule === undefined) return true
  if (typeof rule !== 'function') return rule
  const visCtx: ActionVisibilityContext = {}
  if (ctx?.record !== undefined) visCtx.record = ctx.record
  if (ctx?.user   !== undefined) visCtx.user   = ctx.user
  if (ctx?.values !== undefined) visCtx.values = ctx.values
  try {
    return await rule(visCtx)
  } catch {
    return false
  }
}
