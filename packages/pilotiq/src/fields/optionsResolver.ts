import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Shape of an option in a SelectField / Radio / CheckboxList.
 * `value` round-trips through the form body; `label` is display only.
 */
export type SelectOption = { value: string; label: string }

/**
 * Reactive options resolver. Receives the same `{ $get, $set, record,
 * user, values }` ctx that `afterStateUpdated` sees, runs every resolve
 * cycle, and may be async (for DB-backed lookups). Throws are swallowed
 * to an empty array + console.warn — the field still renders, just with
 * no choices.
 *
 * Used by SelectField, Radio, CheckboxList. Each calls `resolveOptions`
 * from inside its async `toMeta` so the resolver runs at the same point
 * in the render cycle for every dependent-options field type.
 */
export type OptionsResolver = (ctx: {
  $get?:    (name: string) => unknown
  $set?:    (name: string, value: unknown) => void
  record?:  unknown
  user?:    unknown
  values?:  Record<string, unknown>
}) => SelectOption[] | Promise<SelectOption[]>

/**
 * Resolve a `SelectOption[] | OptionsResolver` source against the
 * current render context. Returns the resolved option array, or `[]`
 * with a `console.warn` when the resolver throws — failure should
 * never crash a form render.
 */
export async function resolveOptions(
  source:    SelectOption[] | OptionsResolver,
  ctx:       RenderContext | undefined,
  fieldName: string,
): Promise<SelectOption[]> {
  if (Array.isArray(source)) return source
  try {
    return await source({
      ...(ctx?.$get   ? { $get:   ctx.$get   } : {}),
      ...(ctx?.$set   ? { $set:   ctx.$set   } : {}),
      ...(ctx?.record !== undefined ? { record: ctx.record } : {}),
      ...(ctx?.user   !== undefined ? { user:   ctx.user   } : {}),
      ...(ctx?.values ? { values: ctx.values } : {}),
    })
  } catch (err) {
    console.warn(`[pilotiq] options() resolver for "${fieldName}" threw:`, err)
    return []
  }
}
