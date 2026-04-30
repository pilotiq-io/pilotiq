import type { Field, FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Resolve a single Field against a render context.
 *
 * Returns `null` if the field should be hidden — visibility flags
 * (`hideFromTable` / `hideFromCreate` / etc.) and condition callbacks
 * (`showWhen` / `hideWhen`) are evaluated server-side. The serialized meta
 * never includes a hidden field.
 *
 * Async because reactive Field subclasses (Plan #5 — `SelectField` with
 * a resolver-style `options(fn)`) may compute meta asynchronously.
 */
export async function resolveField(field: Field, ctx: RenderContext = {}): Promise<FieldMeta | null> {
  if (field.isHiddenIn(ctx)) return null
  return await field.toMeta(ctx)
}

/**
 * Resolve an array of Fields, dropping any that are hidden for the current
 * context. Used by `Resource.form()` / `Resource.table()` paths until 1.3
 * unifies Fields under the schema-element resolver.
 */
export async function resolveFields(fields: Field[], ctx: RenderContext = {}): Promise<FieldMeta[]> {
  const metas = await Promise.all(fields.map(f => resolveField(f, ctx)))
  return metas.filter((m): m is FieldMeta => m !== null)
}
