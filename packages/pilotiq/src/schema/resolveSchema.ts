import { Element, type ElementMeta, type LayoutContext } from './Element.js'
import { Field } from '../fields/Field.js'
import {
  RepeaterField,
  type RepeaterItemHiddenRule,
  type RepeaterItemCanRule,
  type RepeaterRowMeta,
} from '../fields/RepeaterField.js'
import {
  BuilderField,
  type BuilderRowMeta,
} from '../fields/BuilderField.js'
import type { BlockMeta } from './Block.js'
import { Action, type ActionMeta, type ActionVisibilityContext } from '../actions/Action.js'
import { ActionGroup } from '../actions/ActionGroup.js'
import { Filter } from '../filters/Filter.js'
import { isServerDataElement, stampServerDataMeta } from './ServerDataElement.js'
import { Entry } from '../entries/Entry.js'
import {
  RepeatableEntry,
  readRepeatableRowId,
  type RepeatableEntryRowMeta,
} from '../entries/RepeatableEntry.js'
import { Section } from './Section.js'
import { Wizard, type WizardActionCustomizer } from './Wizard.js'
import { TextField } from '../fields/TextField.js'
import { Form } from '../elements/Form.js'

export interface SchemaContext {
  user?: { name?: string; email?: string; [key: string]: unknown }
  /** BCP-47 app locale (`Pilotiq.locale()`) for built-in dateTime/money/
   *  numeric formatting in entries. Injected by `uploadCtx`. */
  locale?: string
  [key: string]: unknown
}

/**
 * Render context — extends `SchemaContext` with the rendering mode and
 * optional record. Used by the field resolver to evaluate visibility flags
 * (`hideFromTable` / `hideFromEdit` / etc.) and condition callbacks
 * (`showWhen` / `hideWhen` / `disabledWhen`) against the current page.
 *
 * `mode` is unset on schema-only routes (custom Pages). Field visibility is
 * a no-op in that case.
 */
export type RenderMode = 'table' | 'create' | 'edit' | 'view'

export interface RenderContext extends SchemaContext {
  mode?: RenderMode
  record?: unknown
  /**
   * Current form values for the in-progress resolve cycle. Populated by
   * the partial-resolve endpoint (Plan #5) and by edit/create page
   * builders that prefill from a record. When present, `$get / $set`
   * are framework-bound so field condition callbacks and reactive
   * `options(fn)` handlers can read/write sibling values.
   */
  values?: Record<string, unknown>
  /** Read a sibling field's current value from the resolve cycle's values map. */
  $get?: (name: string) => unknown
  /** Mutate a sibling field's value during this resolve cycle. */
  $set?: (name: string, value: unknown) => void
  /**
   * Name of the field whose change triggered this resolve, if any.
   * Populated only by the partial-resolve endpoint; undefined on
   * initial GET render.
   */
  changed?: string
  /**
   * URL the FileUpload field should POST to. Stamped onto every
   * page-data ctx by the route handlers / page-data builders so the
   * field's `toMeta` doesn't need to know the panel base path. Single
   * panel-level URL — no per-field variation.
   */
  uploadUrl?: string
  /**
   * `true` when the panel has registered an `UploadAdapter` via
   * `Pilotiq.uploads({ adapter })`. Distinct from `uploadUrl` (which is
   * always stamped so `FileUpload` can show a clear error if missed) —
   * this flag tells fields whose upload integration is *optional* (e.g.
   * `MarkdownField`'s `attachFiles` toolbar button) whether to surface
   * the affordance at all.
   */
  hasUploadAdapter?: boolean
  /**
   * Plan #15 — per-widget filter value rode in on the polling-endpoint
   * body. Opaque to the framework: each widget's `getData(ctx)` decodes
   * `ctx.filter` however it wants (`'today' | 'week' | 'month'`, JSON
   * blob, …). Unset on the initial-render path; set on every polling
   * fetch when the user picked something from the per-chart filter
   * dropdown.
   */
  filter?: string
  /**
   * Plan #14 row-scoped sugar inside a Repeater. When the resolver is
   * walking a row's inner schema, `row.index` is the row's position and
   * `row.$get / row.$set` are bound to the row's local values map. The
   * top-level `ctx.$get / $set` still see the whole form (cross-row
   * reads via dotted paths like `items.0.title`); `row.$get(name)` is
   * just sugar for the common case of "read the same row's siblings".
   */
  row?: {
    index: number
    $get:  (name: string) => unknown
    $set:  (name: string, value: unknown) => void
    /**
     * Other rows' values maps, excluding the current row at `index`.
     * Stamped by `resolveRepeaterRows` (every sibling) and
     * `resolveBuilderRows` (only same-block-type siblings; each entry is
     * the row's `data` map). Read by
     * `disableOptionsWhenSelectedInSiblingRepeaterItems()` to mark
     * already-picked options as disabled.
     */
    siblings?: ReadonlyArray<Record<string, unknown>>
    /**
     * Present only when the row lives inside a `BuilderField` — the row's
     * block name. See `LayoutContext.row.blockType` for the rationale.
     */
    blockType?: string
  }
  /**
   * Cascading `inlineLabel` default set by an ancestor `Form` or
   * `Section` via `.inlineLabel(true)`. Read by `Field.buildMeta` when the
   * field hasn't called `inlineLabel()` itself; explicit field-level
   * setting always wins. A nested container's `.inlineLabel(false)`
   * overrides an outer container's `.inlineLabel(true)` for its subtree.
   */
  inlineLabelDefault?: boolean
}

export type SchemaDefinition =
  | Element[]
  | ((ctx: SchemaContext) => Element[] | Promise<Element[]>)

/**
 * Plugin resolver — replaces the default toMeta+recurse behavior for a
 * given element type. Plugins receive the original element, the context,
 * and a `recurse` helper that resolves a child array. Useful when a
 * pro/feature plugin needs to inject computed data, augment meta, or
 * reshape children before serialization.
 *
 * If no resolver is registered for a type, the default (call `toMeta()`,
 * recurse into `getChildren()` if present, attach as `meta.children`) runs.
 */
export type ElementResolver = (
  el: Element,
  ctx: SchemaContext,
  recurse: (children: Element[]) => Promise<ElementMeta[]>,
) => Promise<ElementMeta> | ElementMeta

const registry = new Map<string, ElementResolver>()

/** Register a custom resolver for a given element type. Plugins call this at boot. */
export function registerResolver(type: string, fn: ElementResolver): void {
  registry.set(type, fn)
}

/** Internal — used by tests to reset state. Not part of the public API. */
export function _resetResolverRegistry(): void {
  registry.clear()
}

/**
 * Resolve a schema definition into serializable metadata.
 *
 * Walks the Element tree, calling each element's `toMeta()` (or a registered
 * custom resolver). Children of container elements are resolved recursively
 * and attached as `meta.children`. Fields evaluate visibility flags + record
 * conditions against the `RenderContext`; hidden fields are dropped.
 *
 * Accepts a `SchemaContext` (or the richer `RenderContext`) — the latter is
 * required for Field visibility/condition evaluation to do anything useful.
 */
export async function resolveSchema(
  definition: SchemaDefinition | undefined,
  ctx: RenderContext = {},
): Promise<ElementMeta[]> {
  if (!definition) return []

  const elements = typeof definition === 'function'
    ? await definition(ctx)
    : definition

  return resolveAll(elements, ctx)
}

async function resolveAll(elements: Element[], ctx: RenderContext): Promise<ElementMeta[]> {
  const results = await Promise.all(elements.map(el => resolveOne(el, ctx)))
  // Filter null entries from hidden fields.
  return results.filter((m): m is ElementMeta => m !== null)
}

async function resolveOne(el: Element, ctx: RenderContext): Promise<ElementMeta | null> {
  // Field visibility — drop the entire element if hidden in the current
  // render context. Done before custom resolvers so plugins can't accidentally
  // resurrect a hidden field.
  if (el instanceof Field && el.isHiddenIn(ctx)) {
    return null
  }

  // Action visibility — non-row placements evaluate against the page-level
  // context here; row-placement actions defer to per-row evaluation in
  // `loadTableRecords` (we always include them in the tree). Disabled
  // gets stamped on meta either way.
  if (el instanceof Action && el.hasVisibilityRules() && el.getPlacement() !== 'row') {
    const evalCtx: { record?: unknown; user?: unknown } = {}
    if (ctx.record !== undefined) evalCtx.record = ctx.record
    if (ctx.user   !== undefined) evalCtx.user   = ctx.user
    const { visible } = await el.evaluate(evalCtx)
    if (!visible) return null
  }

  // ActionGroup visibility — same shape as Action; the dropdown trigger
  // hides when the group rule resolves false. Also drop the group when
  // every child action is hidden (group with no usable items is dead UX).
  if (el instanceof ActionGroup) {
    if (el.hasVisibilityRules()) {
      const evalCtx: { record?: unknown; user?: unknown } = {}
      if (ctx.record !== undefined) evalCtx.record = ctx.record
      if (ctx.user   !== undefined) evalCtx.user   = ctx.user
      const { visible } = await el.evaluate(evalCtx)
      if (!visible) return null
    }
  }

  // Layout-level visibility (Plan #8). Field/Action/ActionGroup own
  // their visibility above; this catches every other Element with a
  // `.visible(...)` rule (Section, Card, Tabs, Tab, Grid, Split,
  // Wizard, Step, Group, Fieldset, Heading, Text, …).
  if (!(el instanceof Field) &&
      !(el instanceof Action) &&
      !(el instanceof ActionGroup) &&
      el.hasVisibilityRule()) {
    const layoutCtx = buildLayoutContext(ctx)
    const visible   = await el.evaluateVisibility(layoutCtx)
    if (!visible) return null
  }

  const type = el.getType()

  const customResolver = registry.get(type)
  if (customResolver) {
    return customResolver(el, ctx, children => resolveAll(children, ctx))
  }

  // Default resolution: toMeta() + recurse children if container. Fields
  // get their ctx-aware overload so disabledWhen and reactive subclasses
  // (Plan #5) see the full RenderContext. Async toMeta is awaited —
  // SelectField with a resolver-style `options(fn)` may be async.
  // Filters receive ctx too so subclasses like FormFilter can resolve
  // their inner form schemas with the same render context (e.g. the
  // active user, for option resolvers inside a filter form). Entries
  // (Plan #16) need ctx.record to resolve their state value.
  const meta = await Promise.resolve(
    el instanceof Field || el instanceof Filter || el instanceof Entry
      ? el.toMeta(ctx)
      : el.toMeta(),
  ) as ElementMeta
  meta.type = type // ensure type is always set, even if toMeta forgot

  // Stamp the page-level disabled state on non-row Actions so the renderer
  // greys out the button. Row actions get per-row stamping in dispatchTable.
  if (el instanceof Action && el.hasVisibilityRules() && el.getPlacement() !== 'row') {
    const evalCtx: { record?: unknown; user?: unknown } = {}
    if (ctx.record !== undefined) evalCtx.record = ctx.record
    if (ctx.user   !== undefined) evalCtx.user   = ctx.user
    const { disabled } = await el.evaluate(evalCtx)
    if (disabled) meta['disabled'] = true
  }

  // Same for ActionGroup — stamp disabled when the group's rule says so.
  if (el instanceof ActionGroup && el.hasVisibilityRules()) {
    const evalCtx: { record?: unknown; user?: unknown } = {}
    if (ctx.record !== undefined) evalCtx.record = ctx.record
    if (ctx.user   !== undefined) evalCtx.user   = ctx.user
    const { disabled } = await el.evaluate(evalCtx)
    if (disabled) meta['disabled'] = true
  }

  // Plan #8 — emit `_layout` bag when the element used columnSpan/Start/Order.
  // Stamped after toMeta() so subclasses don't have to remember.
  const layout = el.getLayoutPositioning()
  if (layout) meta._layout = layout

  // Plan #15 — stamp `serverData / id / poll / lazy` on every
  // ServerDataElement so the renderer can find its `_widgetData[id]`
  // payload. The actual data resolution happens in
  // `resolveServerDataElements` (a separate pageData pass) — this just
  // marks the element on the wire.
  if (isServerDataElement(el)) stampServerDataMeta(el, meta)

  // Plan #14 — Repeater rows. Skip the generic `getChildren()` recurse
  // below (the inner schema is rendered per-row, not once on the parent),
  // and instead populate `meta.rows` + `meta.template` with row-scoped
  // contexts so each child sees its own row's values via `$get` / `row`.
  if (el instanceof RepeaterField) {
    await resolveRepeaterRows(el, ctx, meta)
    return meta
  }

  // Plan #14 follow-up — Builder rows. Same row-scoped resolve as
  // Repeater, but each row's inner schema is the block matching the
  // row's submitted `type`. The picker (`meta.blocks`) was already
  // stamped by `BuilderField.toMeta()`.
  if (el instanceof BuilderField) {
    await resolveBuilderRows(el, ctx, meta)
    return meta
  }

  // Filament v5 — `RepeatableEntry` rows. Read-only sibling of Repeater:
  // the array lives on `ctx.record[name]` (no `ctx.values` involvement —
  // entries are display-only) and each row's inner schema resolves with
  // its own `record` scoped to that row's data, so inner entries read
  // their state via the same `record[childName]` lookup they use anywhere
  // else.
  if (el instanceof RepeatableEntry) {
    await resolveRepeatableRows(el, ctx, meta)
    return meta
  }

  // Push `inlineLabelDefault` into the child ctx when this element is a
  // `Form` or `Section` whose `.inlineLabel(...)` was set. Children inherit
  // until another container resets the flag. Field-level `inlineLabel(...)`
  // calls always win on read (see `Field.buildMeta`).
  const childCtx = deriveChildContext(el, ctx)

  const children = el.getChildren()
  if (children && children.length > 0) {
    meta.children = await resolveAll(children, childCtx)
  }

  // Filament v5 — `Section.afterHeader([Action…])` resolves through the
  // standard walker so every Action's `.visible() / .disabled()` rule
  // evaluates the same way it does anywhere else. Stamped under
  // `meta.afterHeader` so the renderer doesn't confuse it with the
  // section's body content (`meta.children`).
  if (el instanceof Section) {
    const afterHeader = el.getAfterHeader()
    if (afterHeader && afterHeader.length > 0) {
      meta['afterHeader'] = await resolveAll(afterHeader, ctx)
    }
  }

  // Filament v5 — `Action.modalContentFooter([Element…])` resolves through
  // the standard walker so any inner Actions evaluate `.visible() /
  // .disabled()` the same way as anywhere else, and non-Action chrome
  // (Alert / Text / Heading / …) flows through the same rendering path.
  // Stamped under `meta.modalContentFooter` so the renderer can mount it
  // between the form body and the Cancel/Submit footer.
  if (el instanceof Action) {
    const footer = el.getModalContentFooter()
    if (footer && footer.length > 0) {
      meta['modalContentFooter'] = await resolveAll(footer, ctx)
    }
  }

  // `Wizard.submitAction() / nextAction() / previousAction()` — build a
  // framework default Action for each slot, run the user's customizer
  // (or take the explicit Action), then resolve through the standard
  // walker so `.visible() / .disabled()` rules evaluate the same way
  // as anywhere else. Stamped under `meta.submitAction / nextAction /
  // previousAction`; sparse — absent when the user hasn't customized.
  if (el instanceof Wizard) {
    const submitC   = el.getSubmitAction()
    const nextC     = el.getNextAction()
    const previousC = el.getPreviousAction()
    if (submitC) {
      const [resolved] = await resolveAll([resolveWizardAction(submitC, 'submit')], ctx)
      if (resolved) meta['submitAction'] = resolved
    }
    if (nextC) {
      const [resolved] = await resolveAll([resolveWizardAction(nextC, 'next')], ctx)
      if (resolved) meta['nextAction'] = resolved
    }
    if (previousC) {
      const [resolved] = await resolveAll([resolveWizardAction(previousC, 'previous')], ctx)
      if (resolved) meta['previousAction'] = resolved
    }
  }

  // `TextField.prefixAction(Action) / suffixAction(Action)` — resolve the
  // bound Actions through `resolveAll` so visibility / disabled rules
  // evaluate the same way as anywhere else. Hidden Actions are dropped
  // from the slot (returning a sparse single-element array → undefined
  // collapses cleanly).
  if (el instanceof TextField) {
    const pre  = el.getPrefixAction()
    const suf  = el.getSuffixAction()
    if (pre) {
      const [resolved] = await resolveAll([pre], ctx)
      if (resolved) meta['prefixAction'] = resolved
    }
    if (suf) {
      const [resolved] = await resolveAll([suf], ctx)
      if (resolved) meta['suffixAction'] = resolved
    }
  }

  return meta
}

/**
 * Per-row resolution for `RepeaterField`. Reads submitted row values from
 * `ctx.values?.[field.name]`, falls back to `defaultItems` empty rows on
 * fresh renders, resolves the inner schema once per row with a row-scoped
 * `RenderContext`, and stamps `meta.rows` + `meta.template`.
 *
 * `template` is the empty-row blueprint the client clones when the user
 * presses "Add row" — resolved with `values: {}` so any `default()` /
 * `defaultValue` on inner fields surfaces correctly.
 */
async function resolveRepeaterRows(
  field: RepeaterField,
  ctx:   RenderContext,
  meta:  ElementMeta,
): Promise<void> {
  const inner       = field.getInnerSchema()
  const submitted   = ctx.values?.[field.name]
  // For `simple()` repeaters the loaded record / submitted value is a
  // flat `[v1, v2, …]` array. Wrap each primitive entry inline using the
  // inner field's name so the rest of the resolver path treats it as a
  // standard `[{<innerName>: v}]` row. Object entries pass through (e.g.
  // when a coerce/state-update has already produced wrapped rows).
  const simpleInner = field.getSimpleInnerField()
  const rowsInput: Array<Record<string, unknown>> = Array.isArray(submitted)
    ? submitted.map(raw => simpleInner ? coerceSimpleRowValues(raw, simpleInner.name) : coerceRowValues(raw))
    : Array.from({ length: field.getDefaultItems() }, () => ({}))

  const labelFn     = field.getItemLabel()
  const hiddenFn    = field.getItemHidden()
  const canDeleteFn = field.getItemCanDelete()
  const canCloneFn  = field.getItemCanClone()
  const canReorderFn = field.getItemCanReorder()

  const rows = await Promise.all(rowsInput.map(async (rowValues, index) => {
    const siblings = rowsInput.filter((_, i) => i !== index)
    const rowCtx: RenderContext = {
      ...ctx,
      values: rowValues,
      $get:   (name: string) => rowValues[name],
      $set:   (name: string, value: unknown) => { rowValues[name] = value },
      row:    {
        index,
        $get: (name: string) => rowValues[name],
        $set: (name: string, value: unknown) => { rowValues[name] = value },
        siblings,
      },
    }
    delete rowCtx.changed // changed key is parent-scoped; not meaningful inside the row resolve
    const children = await resolveAll(inner, rowCtx)
    const id = readRowId(rowValues, field.name, index)
    const row: RepeaterRowMeta = { id, children }
    if (labelFn) {
      try {
        const label = labelFn(rowValues)
        if (typeof label === 'string') row.itemLabel = label
      } catch (err) {
        console.warn(`[pilotiq] itemLabel() on Repeater "${field.name}" threw:`, err)
      }
    }
    // Build the layout context lazily — most repeaters configure none of
    // {hidden, canDelete, canClone, canReorder}, so the common path skips
    // it entirely.
    const needsLayoutCtx = hiddenFn !== undefined
      || canDeleteFn !== undefined
      || canCloneFn !== undefined
      || canReorderFn !== undefined
    const layoutCtx = needsLayoutCtx ? buildLayoutContext(rowCtx) : undefined
    if (hiddenFn !== undefined && layoutCtx !== undefined) {
      const hidden = await evalItemHidden(hiddenFn, layoutCtx, `Repeater "${field.name}"`)
      if (hidden) row.hidden = true
    }
    if (canDeleteFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canDeleteFn, layoutCtx, 'itemCanDelete', `Repeater "${field.name}"`)
      if (!allowed) row.canDelete = false
    }
    if (canCloneFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canCloneFn, layoutCtx, 'itemCanClone', `Repeater "${field.name}"`)
      if (!allowed) row.canClone = false
    }
    if (canReorderFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canReorderFn, layoutCtx, 'itemCanReorder', `Repeater "${field.name}"`)
      if (!allowed) row.canReorder = false
    }
    const extras = field.getExtraItemActions()
    if (extras.length > 0) {
      const resolved = await resolveExtraItemActions(extras, ctx, rowValues)
      if (resolved.length > 0) row.extraActions = resolved
    }
    return row
  }))

  const templateCtx: RenderContext = { ...ctx, values: {} }
  delete templateCtx.row
  delete templateCtx.changed
  const template = await resolveAll(inner, templateCtx)

  meta['rows']     = rows
  meta['template'] = template
}

/**
 * Resolve a Repeater/Builder field's `extraItemActions` for one row.
 *
 * Each action's `.visible() / .hidden() / .disabled()` rules see a
 * `ActionVisibilityContext` with the parent record + user (so an action
 * can authorize against the page's user) plus the row's `values` and
 * `row.{ index, id, blockType? }` (so per-row predicates work).
 *
 * Visibility-eval throwers fail-closed (the action is dropped from the
 * row's strip — same posture as page-level Action visibility).
 *
 * Disabled stamping mirrors row-placement table actions: visibility =
 * include/exclude in the strip; disabled = stamp `disabled: true` on
 * the meta so the renderer greys it out.
 */
async function resolveExtraItemActions(
  actions:   Action[],
  ctx:       RenderContext,
  rowValues: Record<string, unknown>,
): Promise<ActionMeta[]> {
  const out: ActionMeta[] = []
  for (const action of actions) {
    const evalCtx: ActionVisibilityContext = { values: rowValues }
    if (ctx.record !== undefined) evalCtx.record = ctx.record
    if (ctx.user   !== undefined) evalCtx.user   = ctx.user
    let visible  = true
    let disabled = false
    if (action.hasVisibilityRules()) {
      const result = await action.evaluate(evalCtx)
      visible  = result.visible
      disabled = result.disabled
    }
    if (!visible) continue
    const meta = action.toMeta()
    if (disabled) meta.disabled = true
    out.push(meta)
  }
  return out
}

function coerceRowValues(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

/**
 * Variant of `coerceRowValues` for `Repeater.simple(field)`. Object rows
 * pass through (already wrapped); primitive / null / undefined entries
 * are wrapped under the inner field's name so the resolve / validate /
 * coerce pipeline keeps using the standard `{ <innerName>: value }`
 * shape regardless of whether the caller fed flat `[v1, v2]` (loaded
 * record, or `withValues({ name: ['x'] })`) or wrapped `[{name: v1}]`
 * (post-coerce, post-state-update).
 */
function coerceSimpleRowValues(raw: unknown, innerName: string): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  if (raw === undefined) return {}
  return { [innerName]: raw }
}

// Fail-closed-as-visible: a throwing predicate keeps the row visible —
// inverse of `Element.evaluateVisibility` because silently hiding data the
// user is editing is the worse failure mode.
async function evalItemHidden(
  rule:    RepeaterItemHiddenRule,
  ctx:     LayoutContext,
  ownerId: string,
): Promise<boolean> {
  if (typeof rule === 'boolean') return rule
  try {
    return Boolean(await rule(ctx))
  } catch (err) {
    console.warn(`[pilotiq] itemHidden() on ${ownerId} threw:`, err)
    return false
  }
}

/**
 * Stable row id. Prefers a round-tripped `__id` posted from the client
 * (string-only — anything else is ignored to keep the meta JSON-clean),
 * otherwise generates a deterministic id from the field name + row index
 * so server re-renders are idempotent. The client renderer (Step 7)
 * upgrades fresh rows to crypto-random UUIDs before persisting them
 * through the form-state map.
 */
function readRowId(row: Record<string, unknown>, fieldName: string, index: number): string {
  const raw = row['__id']
  if (typeof raw === 'string' && raw.length > 0) return raw
  return `${fieldName}-${index}`
}

/**
 * Per-row resolution for `BuilderField`. Each submitted row is
 * `{ __id?, type, data?: {…} }`. We pick the block matching `type`,
 * resolve its `schema()` against a row-scoped context where `values`
 * is the row's `data` body (so `$get('heading')` reads the row's
 * heading, not the parent form's), and stamp `meta.rows`.
 *
 * Rows whose `type` doesn't match a registered block are shipped with
 * `unknownType: true` and empty `children` — the renderer falls back to
 * a "missing block" placeholder. Values still round-trip through
 * FormData (the renderer keeps the row's `__id` + `type` in hidden
 * inputs) so a config-rollback doesn't silently drop data.
 *
 * No template is shipped (`BuilderFieldMeta` doesn't carry one): the
 * client builds fresh rows by reading the picked block's children from
 * a server-resolved sample after the user picks the type. v1 ships
 * empty `data: {}` and lets the inner schema's `default()` values
 * surface on the next live re-resolve.
 */
async function resolveBuilderRows(
  field: BuilderField,
  ctx:   RenderContext,
  meta:  ElementMeta,
): Promise<void> {
  const submitted = ctx.values?.[field.name]
  const rowsInput = Array.isArray(submitted) ? submitted.map(coerceBuilderRow) : []

  const labelFn      = field.getItemLabel()
  const hiddenFn     = field.getItemHidden()
  const canDeleteFn  = field.getItemCanDelete()
  const canCloneFn   = field.getItemCanClone()
  const canReorderFn = field.getItemCanReorder()

  const rows = await Promise.all(rowsInput.map(async (rowEntry, index) => {
    const blockName = rowEntry.type
    const block     = blockName ? field.getBlock(blockName) : undefined
    const data      = rowEntry.data
    const id        = readBuilderRowId(rowEntry, field.name, index)

    if (!block) {
      const unknown: BuilderRowMeta = {
        id,
        type:        blockName ?? '',
        children:    [],
        unknownType: true,
      }
      return unknown
    }

    // Builder siblings are scoped to same-block-type rows only — the
    // option pickers in a `heading` block aren't shadowed by picks in a
    // `paragraph` block (different schemas, different `name` keys).
    // Each entry is the sibling's `data` map (not the envelope) so the
    // field's lookup `siblings[i][fieldName]` works the same as Repeater.
    const siblings: Record<string, unknown>[] = []
    for (let j = 0; j < rowsInput.length; j++) {
      if (j === index) continue
      const other = rowsInput[j]!
      if (other.type !== blockName) continue
      siblings.push(other.data)
    }
    const rowCtx: RenderContext = {
      ...ctx,
      values: data,
      $get:   (name: string) => data[name],
      $set:   (name: string, value: unknown) => { data[name] = value },
      row:    {
        index,
        $get: (name: string) => data[name],
        $set: (name: string, value: unknown) => { data[name] = value },
        siblings,
        blockType: block.name,
      },
    }
    delete rowCtx.changed

    const children = await resolveAll(block.getSchema(), rowCtx)
    const row: BuilderRowMeta = { id, type: block.name, children }

    if (labelFn) {
      try {
        const label = labelFn(data, block.name)
        if (typeof label === 'string') row.itemLabel = label
      } catch (err) {
        console.warn(`[pilotiq] itemLabel() on Builder "${field.name}" threw:`, err)
      }
    }
    const needsLayoutCtx = hiddenFn !== undefined
      || canDeleteFn !== undefined
      || canCloneFn !== undefined
      || canReorderFn !== undefined
    const layoutCtx = needsLayoutCtx ? buildLayoutContext(rowCtx) : undefined
    if (hiddenFn !== undefined && layoutCtx !== undefined) {
      const hidden = await evalItemHidden(hiddenFn, layoutCtx, `Builder "${field.name}"`)
      if (hidden) row.hidden = true
    }
    if (canDeleteFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canDeleteFn, layoutCtx, 'itemCanDelete', `Builder "${field.name}"`)
      if (!allowed) row.canDelete = false
    }
    if (canCloneFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canCloneFn, layoutCtx, 'itemCanClone', `Builder "${field.name}"`)
      if (!allowed) row.canClone = false
    }
    if (canReorderFn !== undefined && layoutCtx !== undefined) {
      const allowed = await evalItemCan(canReorderFn, layoutCtx, 'itemCanReorder', `Builder "${field.name}"`)
      if (!allowed) row.canReorder = false
    }
    const extras = field.getExtraItemActions()
    if (extras.length > 0) {
      const resolved = await resolveExtraItemActions(extras, ctx, data)
      if (resolved.length > 0) row.extraActions = resolved
    }
    return row
  }))

  // Resolve a fresh-row template per block (empty values map). The
  // client uses these blueprints when the user picks a block from the
  // picker, so the new row's inputs render with whatever `default()`
  // values + visibility state apply to a blank record. Resolved here
  // rather than once-and-cached because conditional `options(fn)` can
  // depend on the surrounding `record / user / values` context.
  //
  // `Block.visible(rule)` is evaluated against an outer (not row-scoped)
  // LayoutContext — it's a picker-time gate, not a per-row gate. Hidden
  // blocks drop from `meta.blocks` so the picker doesn't show them; rows
  // already in `submitted` data of that block-type still render above
  // (the for-loop over `rowsInput` is independent of `getBlocks()`).
  const pickerLayoutCtx = buildLayoutContext(ctx)
  const blocksMetaRaw = await Promise.all(field.getBlocks().map(async block => {
    const visible = await block.evaluateVisibility(pickerLayoutCtx)
    if (!visible) return null
    const templateCtx: RenderContext = { ...ctx, values: {} }
    delete templateCtx.row
    delete templateCtx.changed
    const template = await resolveAll(block.getSchema(), templateCtx)
    const m = block.toMeta()
    m.template = template
    return m
  }))
  const blocksMeta = blocksMetaRaw.filter((m): m is BlockMeta => m !== null)

  meta['rows']   = rows
  meta['blocks'] = blocksMeta
}

/**
 * Per-row resolution for `RepeatableEntry`. Reads the array off
 * `ctx.record[name]`, resolves the inner schema once per row with `record`
 * scoped to that row's data, and stamps `meta.rows` with the resolved
 * children.
 *
 * Non-array / null / undefined / empty-array values stamp an empty
 * `meta.rows` — the renderer falls through to the `default()` placeholder
 * (inherited from `Entry.default()`).
 */
async function resolveRepeatableRows(
  entry: RepeatableEntry,
  ctx:   RenderContext,
  meta:  ElementMeta,
): Promise<void> {
  const inner       = entry.getInnerSchema()
  const fieldName   = entry.getName()
  const sourceArray = readRecordArray(ctx.record, fieldName)
  if (sourceArray === undefined || sourceArray.length === 0 || inner.length === 0) {
    meta['rows'] = []
    return
  }

  const rows = await Promise.all(sourceArray.map(async (raw, index) => {
    const rowRecord = coerceRowRecord(raw)
    const rowCtx: RenderContext = { ...ctx, record: rowRecord }
    delete rowCtx.values
    delete rowCtx.$get
    delete rowCtx.$set
    delete rowCtx.changed
    delete rowCtx.row
    const children = await resolveAll(inner, rowCtx)
    const id = readRepeatableRowId(raw, fieldName, index)
    const row: RepeatableEntryRowMeta = { id, children }
    return row
  }))

  meta['rows'] = rows
}

/** Read a record's array-shaped property by name. Returns `undefined` when
 *  absent / null / non-array — callers fall through to the empty-state
 *  placeholder. */
function readRecordArray(record: unknown, name: string): unknown[] | undefined {
  if (record === null || record === undefined || typeof record !== 'object') return undefined
  const value = (record as Record<string, unknown>)[name]
  return Array.isArray(value) ? value : undefined
}

/** Coerce an arbitrary array element into a `Record<string, unknown>` for
 *  the row's `RenderContext.record`. Object rows pass through (clone to
 *  avoid downstream mutation); primitives stash under a reserved `_value`
 *  key so an inner `TextEntry.make('_value')` can still target them
 *  (mirrors the read-only equivalent of Repeater's flat-array fallback). */
function coerceRowRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  if (raw === undefined || raw === null) return {}
  return { _value: raw }
}

interface BuilderRowEntry {
  __id?: string
  type:  string
  data:  Record<string, unknown>
}

/**
 * Normalize an arbitrary submitted row entry into the `{ __id?, type, data }`
 * envelope. Robust to JSON bodies (already-shaped) and to flat-fold output
 * from `coerceBuilderValue` (top-level `__id`/`type` siblings of `data`).
 *
 * Returns an entry with a possibly-empty `type` ("" → unknownType row) so
 * the resolver still emits a `BuilderRowMeta` for shape stability — the
 * renderer drops empty-type rows visually.
 */
function coerceBuilderRow(raw: unknown): BuilderRowEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { type: '', data: {} }
  }
  const r = raw as Record<string, unknown>
  const type = typeof r['type'] === 'string' ? (r['type'] as string) : ''
  const dataRaw = r['data']
  const data: Record<string, unknown> = (dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw))
    ? { ...(dataRaw as Record<string, unknown>) }
    : {}
  const out: BuilderRowEntry = { type, data }
  if (typeof r['__id'] === 'string') out.__id = r['__id'] as string
  return out
}

function readBuilderRowId(row: BuilderRowEntry, fieldName: string, index: number): string {
  if (typeof row.__id === 'string' && row.__id.length > 0) return row.__id
  return `${fieldName}-${index}`
}

/**
 * Evaluate a per-row capability rule (`itemCanDelete / itemCanClone /
 * itemCanReorder`) against a row's `LayoutContext`. Returns the boolean
 * "is allowed" — `true` keeps the matching button mounted, `false`
 * removes it on this row.
 *
 * Fail-open: when the predicate throws, the capability stays enabled and
 * we log a warning. This mirrors `itemHidden`'s posture — a misbehaving
 * gate shouldn't silently lock the user out of editing data. For real
 * authorization (vs. UX), gate the parent form's lifecycle hooks.
 *
 * Shared between Repeater + Builder so the failure mode is identical.
 */
async function evalItemCan(
  rule:    RepeaterItemCanRule,
  ctx:     LayoutContext,
  setter:  string,
  ownerId: string,
): Promise<boolean> {
  if (typeof rule === 'boolean') return rule
  try {
    return Boolean(await rule(ctx))
  } catch (err) {
    console.warn(`[pilotiq] ${setter}() on ${ownerId} threw:`, err)
    return true
  }
}

/**
 * Build a layout-visibility context from the resolver's `RenderContext`.
 * Mirrors the `Field.buildConditionContext` shape so layout `visible(fn)`
 * callbacks can destructure the same way as `Field.showWhen` callbacks.
 */
/**
 * Resolve a `WizardActionCustomizer` against the framework default for
 * the given slot. The default carries a stable `name` (`wizardSubmit /
 * wizardNext / wizardPrevious`) and sensible chrome — the customizer
 * may pass through verbatim, mutate, or replace entirely. Returned
 * `Action` is then resolved through the standard walker so visibility
 * and disabled rules evaluate the same way as any other Action.
 */
function resolveWizardAction(customizer: WizardActionCustomizer, slot: 'submit' | 'next' | 'previous'): Action {
  const def = slot === 'submit'
    ? Action.make('wizardSubmit').label('Submit').color('primary')
    : slot === 'next'
      ? Action.make('wizardNext').label('Next').color('primary')
      : Action.make('wizardPrevious').label('Back').color('ghost')
  return typeof customizer === 'function' ? customizer(def) : customizer
}

function buildLayoutContext(ctx: RenderContext): LayoutContext {
  const out: LayoutContext = {}
  if (ctx.record !== undefined) out.record = ctx.record
  if (ctx.values !== undefined) out.values = ctx.values
  if (ctx.$get) out.$get = ctx.$get
  if (ctx.$set) out.$set = ctx.$set
  if (ctx.user !== undefined) out.user = ctx.user
  if (ctx.row   !== undefined) out.row   = ctx.row
  return out
}

/**
 * Derive the render context that this element's children should see.
 * Currently only handles the `inlineLabelDefault` cascade — `Form` /
 * `Section` with `.inlineLabel(true|false)` push the value into the
 * descendant context so every nested `Field.buildMeta` can read it.
 * A nested container that re-sets the flag overrides the outer value
 * for its subtree (the current ctx's value is replaced, not merged).
 *
 * Returns the same `ctx` reference when nothing needs to change so
 * call sites that pass it down skip a fresh object allocation.
 */
function deriveChildContext(el: Element, ctx: RenderContext): RenderContext {
  if (el instanceof Form || el instanceof Section) {
    const v = (el as Form | Section).getInlineLabel?.()
    if (v !== undefined && v !== ctx.inlineLabelDefault) {
      return { ...ctx, inlineLabelDefault: v }
    }
  }
  return ctx
}
