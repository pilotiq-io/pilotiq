import { Element, type ElementMeta } from './Element.js'
import { Field } from '../fields/Field.js'
import { Action } from '../actions/Action.js'

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
  if (el instanceof Field && el.isHiddenIn(ctx.mode, ctx.record)) {
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
    const { visible } = el.evaluate(evalCtx)
    if (!visible) return null
  }

  const type = el.getType()

  const customResolver = registry.get(type)
  if (customResolver) {
    return customResolver(el, ctx, children => resolveAll(children, ctx))
  }

  // Default resolution: toMeta() + recurse children if container. Fields
  // get their record-aware overload so disabledWhen evaluates correctly.
  const meta = (el instanceof Field ? el.toMeta(ctx.record) : el.toMeta()) as ElementMeta
  meta.type = type // ensure type is always set, even if toMeta forgot

  // Stamp the page-level disabled state on non-row Actions so the renderer
  // greys out the button. Row actions get per-row stamping in dispatchTable.
  if (el instanceof Action && el.hasVisibilityRules() && el.getPlacement() !== 'row') {
    const evalCtx: { record?: unknown; user?: unknown } = {}
    if (ctx.record !== undefined) evalCtx.record = ctx.record
    if (ctx.user   !== undefined) evalCtx.user   = ctx.user
    const { disabled } = el.evaluate(evalCtx)
    if (disabled) meta['disabled'] = true
  }

  const children = el.getChildren()
  if (children && children.length > 0) {
    meta.children = await resolveAll(children, ctx)
  }

  return meta
}
