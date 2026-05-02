import { Element, type ElementMeta, type LayoutContext } from './Element.js'
import { Field } from '../fields/Field.js'
import {
  RepeaterField,
  type RepeaterItemHiddenRule,
  type RepeaterRowMeta,
} from '../fields/RepeaterField.js'
import {
  BuilderField,
  type BuilderItemHiddenRule,
  type BuilderRowMeta,
} from '../fields/BuilderField.js'
import { Action } from '../actions/Action.js'
import { ActionGroup } from '../actions/ActionGroup.js'
import { Filter } from '../filters/Filter.js'

export interface SchemaContext {
  user?: { name?: string; email?: string; [key: string]: unknown }
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
  }
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
  // active user, for option resolvers inside a filter form).
  const meta = await Promise.resolve(
    el instanceof Field || el instanceof Filter ? el.toMeta(ctx) : el.toMeta(),
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

  const children = el.getChildren()
  if (children && children.length > 0) {
    meta.children = await resolveAll(children, ctx)
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
  const rowsInput: Array<Record<string, unknown>> = Array.isArray(submitted)
    ? submitted.map(coerceRowValues)
    : Array.from({ length: field.getDefaultItems() }, () => ({}))

  const labelFn  = field.getItemLabel()
  const hiddenFn = field.getItemHidden()

  const rows = await Promise.all(rowsInput.map(async (rowValues, index) => {
    const rowCtx: RenderContext = {
      ...ctx,
      values: rowValues,
      $get:   (name: string) => rowValues[name],
      $set:   (name: string, value: unknown) => { rowValues[name] = value },
      row:    {
        index,
        $get: (name: string) => rowValues[name],
        $set: (name: string, value: unknown) => { rowValues[name] = value },
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
    if (hiddenFn !== undefined) {
      const layoutCtx = buildLayoutContext(rowCtx)
      const hidden    = await evalItemHidden(hiddenFn, layoutCtx, field.name)
      if (hidden) row.hidden = true
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

function coerceRowValues(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

/**
 * Evaluate `Repeater.itemHidden(rule)` against a row's `LayoutContext`.
 *
 * Fail-closed-as-visible: when the predicate throws, the row stays visible
 * and we log a warning. This is the inverse of `Element.evaluateVisibility`
 * (which fails-closed-as-hidden) — a misbehaving `itemHidden` should never
 * silently hide data the user is editing.
 */
async function evalItemHidden(
  rule:      RepeaterItemHiddenRule,
  ctx:       LayoutContext,
  fieldName: string,
): Promise<boolean> {
  if (typeof rule === 'boolean') return rule
  try {
    return Boolean(await rule(ctx))
  } catch (err) {
    console.warn(`[pilotiq] itemHidden() on Repeater "${fieldName}" threw:`, err)
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

  const labelFn  = field.getItemLabel()
  const hiddenFn = field.getItemHidden()

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

    const rowCtx: RenderContext = {
      ...ctx,
      values: data,
      $get:   (name: string) => data[name],
      $set:   (name: string, value: unknown) => { data[name] = value },
      row:    {
        index,
        $get: (name: string) => data[name],
        $set: (name: string, value: unknown) => { data[name] = value },
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
    if (hiddenFn !== undefined) {
      const layoutCtx = buildLayoutContext(rowCtx)
      const hidden    = await evalBuilderItemHidden(hiddenFn, layoutCtx, field.name)
      if (hidden) row.hidden = true
    }
    return row
  }))

  // Resolve a fresh-row template per block (empty values map). The
  // client uses these blueprints when the user picks a block from the
  // picker, so the new row's inputs render with whatever `default()`
  // values + visibility state apply to a blank record. Resolved here
  // rather than once-and-cached because conditional `options(fn)` can
  // depend on the surrounding `record / user / values` context.
  const blocksMeta = await Promise.all(field.getBlocks().map(async block => {
    const templateCtx: RenderContext = { ...ctx, values: {} }
    delete templateCtx.row
    delete templateCtx.changed
    const template = await resolveAll(block.getSchema(), templateCtx)
    const m = block.toMeta()
    m.template = template
    return m
  }))

  meta['rows']   = rows
  meta['blocks'] = blocksMeta
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

async function evalBuilderItemHidden(
  rule:      BuilderItemHiddenRule,
  ctx:       LayoutContext,
  fieldName: string,
): Promise<boolean> {
  if (typeof rule === 'boolean') return rule
  try {
    return Boolean(await rule(ctx))
  } catch (err) {
    console.warn(`[pilotiq] itemHidden() on Builder "${fieldName}" threw:`, err)
    return false
  }
}

/**
 * Build a layout-visibility context from the resolver's `RenderContext`.
 * Mirrors the `Field.buildConditionContext` shape so layout `visible(fn)`
 * callbacks can destructure the same way as `Field.showWhen` callbacks.
 */
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
