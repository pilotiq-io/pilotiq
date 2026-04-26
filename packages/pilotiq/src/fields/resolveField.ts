import type { Field, FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Resolve a single Field against a render context.
 *
 * Returns `null` if the field should be hidden — visibility flags
 * (`hideFromTable` / `hideFromCreate` / etc.) and condition callbacks
 * (`showWhen` / `hideWhen`) are evaluated server-side. The serialized meta
 * never includes a hidden field.
 */
export function resolveField(field: Field, ctx: RenderContext = {}): FieldMeta | null {
  if (field.isHiddenIn(ctx.mode, ctx.record)) return null
  return field.toMeta(ctx.record)
}

/**
 * Resolve an array of Fields, dropping any that are hidden for the current
 * context. Used by `Resource.form()` / `Resource.table()` paths until 1.3
 * unifies Fields under the schema-element resolver.
 */
export function resolveFields(fields: Field[], ctx: RenderContext = {}): FieldMeta[] {
  const out: FieldMeta[] = []
  for (const f of fields) {
    const meta = resolveField(f, ctx)
    if (meta) out.push(meta)
  }
  return out
}
