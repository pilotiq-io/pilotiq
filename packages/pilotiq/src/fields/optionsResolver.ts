import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Shape of an option in a SelectField / Radio / CheckboxList.
 * `value` round-trips through the form body; `label` is display only.
 *
 * `value` accepts `number` so integer-PK apps don't have to wrap every id
 * in `String(...)` — but HTML form bodies are string-only, so values are
 * normalized to strings at the wire boundary (`resolveOptions`). What the
 * renderer sees — and what comes back on submit — is always a string;
 * coerce it back in a `dehydrateStateUsing` / `mutateData` hook (or lean
 * on the ORM's casts) when the column is numeric.
 *
 * `disabled` greys the option out and blocks selection. Stamped server-side
 * by `disableOptionsWhenSelectedInSiblingRepeaterItems()` for options taken
 * in sibling Repeater/Builder rows; users may also set it themselves on the
 * static option list to express "this choice is permanently unavailable".
 */
export type SelectOption = { value: string | number; label: string; disabled?: boolean }

/**
 * The wire shape after `resolveOptions` — `value` is always a string so
 * the client's strict-equality checks (`fieldValue === option.value`) and
 * the string-only form body stay consistent end to end.
 */
export type ResolvedSelectOption = { value: string; label: string; disabled?: boolean }

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

/** Normalize an option list to the wire shape — `String(value)`. */
function toResolvedOptions(options: SelectOption[]): ResolvedSelectOption[] {
  return options.map(o => (typeof o.value === 'string' ? (o as ResolvedSelectOption) : { ...o, value: String(o.value) }))
}

/**
 * Resolve a `SelectOption[] | OptionsResolver` source against the
 * current render context. Returns the resolved option array — values
 * normalized to strings (numeric inputs allowed, string wire) — or `[]`
 * with a `console.warn` when the resolver throws — failure should
 * never crash a form render.
 */
export async function resolveOptions(
  source:    SelectOption[] | OptionsResolver,
  ctx:       RenderContext | undefined,
  fieldName: string,
): Promise<ResolvedSelectOption[]> {
  if (Array.isArray(source)) return toResolvedOptions(source)
  try {
    return toResolvedOptions(await source({
      ...(ctx?.$get   ? { $get:   ctx.$get   } : {}),
      ...(ctx?.$set   ? { $set:   ctx.$set   } : {}),
      ...(ctx?.record !== undefined ? { record: ctx.record } : {}),
      ...(ctx?.user   !== undefined ? { user:   ctx.user   } : {}),
      ...(ctx?.values ? { values: ctx.values } : {}),
    }))
  } catch (err) {
    console.warn(`[pilotiq] options() resolver for "${fieldName}" threw:`, err)
    return []
  }
}

/**
 * Apply the "disable options taken in sibling Repeater/Builder rows" gate.
 * No-op outside an array-row context (no `ctx.row.siblings`) or when the
 * field hasn't opted in. Builder scoping (same-block-type only) is handled
 * by the resolver — by the time we get here, `ctx.row.siblings` already
 * reflects the right scope.
 *
 * Multi-value sibling rows (e.g. `CheckboxList` storing `string[]`) unfold
 * into individual taken values; single-value rows contribute one taken
 * entry. Empty / null / `''` sibling values are skipped (they aren't real
 * picks yet — same posture as `Field.distinct()`'s default `ignoreNulls`).
 */
export function disableOptionsTakenInSiblings(
  options:   ResolvedSelectOption[],
  enabled:   boolean,
  fieldName: string,
  ctx:       RenderContext | undefined,
): ResolvedSelectOption[] {
  if (!enabled) return options
  const siblings = ctx?.row?.siblings
  if (!siblings || siblings.length === 0) return options
  const taken = new Set<string>()
  for (const sib of siblings) {
    if (!sib || typeof sib !== 'object') continue
    const v = (sib as Record<string, unknown>)[fieldName]
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x === undefined || x === null || x === '') continue
        taken.add(String(x))
      }
    } else if (v !== undefined && v !== null && v !== '') {
      taken.add(String(v))
    }
  }
  if (taken.size === 0) return options
  return options.map(o => (taken.has(o.value) && !o.disabled ? { ...o, disabled: true } : o))
}
