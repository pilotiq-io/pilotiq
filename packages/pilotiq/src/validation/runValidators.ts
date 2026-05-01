import { Element } from '../schema/Element.js'
import { Field } from '../fields/Field.js'
import { RepeaterField } from '../fields/RepeaterField.js'

export interface ValidationErrors {
  [fieldName: string]: string[]
}

/**
 * Walk an Element tree, run every Field's validators against the matching
 * value in `values`, and return a `{ name -> errors[] }` map.
 *
 * The map is empty when every field passes. Fields with no validators
 * (and no `required` flag) never appear in the output. The caller decides
 * whether a non-empty map should reject the submit.
 *
 * `record` is the persisted record under edit, when present — it propagates
 * to each validator's `ctx` for cross-field rules that need it.
 *
 * Plan #14 — Repeater fields validate each row's inner schema recursively.
 * Per-row errors are flat-keyed as `${fieldName}.${i}.${childName}` so the
 * client can surface them inline on the right row. `minItems` / `maxItems`
 * land under the bare repeater name.
 */
export function validateSchema(
  elements: Element[],
  values: Record<string, unknown>,
  record?: unknown,
): ValidationErrors {
  const errors: ValidationErrors = {}
  walk(elements, el => {
    if (el instanceof RepeaterField) {
      // Reconstruct array shape from flat keys when the body arrived
      // form-encoded (`items.0.product=…`). Validation runs before
      // coercion in `dispatchFormSubmit`, so without this fold the
      // Repeater would always look empty on flat-key submits.
      const raw = values[el.name]
      const rows = Array.isArray(raw) ? raw : foldFlatRepeaterRows(values, el.name)
      validateRepeater(el, rows, record, errors)
      return
    }
    if (!(el instanceof Field)) return
    const value = values[el.name]
    const ctx: { values: Record<string, unknown>; record?: unknown } = { values }
    if (record !== undefined) ctx.record = record
    const fieldErrors = el.runValidators(value, ctx)
    if (fieldErrors.length > 0) errors[el.name] = fieldErrors
  })
  return errors
}

function validateRepeater(
  field:  RepeaterField,
  raw:    unknown,
  record: unknown,
  errors: ValidationErrors,
): void {
  const rows = Array.isArray(raw) ? raw : []
  const baseErrors: string[] = []

  const min = field.getMinItems()
  if (min !== undefined && rows.length < min) {
    baseErrors.push(min === 1
      ? 'At least 1 item is required'
      : `At least ${min} items are required`)
  }

  const max = field.getMaxItems()
  if (max !== undefined && rows.length > max) {
    baseErrors.push(max === 1
      ? 'At most 1 item is allowed'
      : `At most ${max} items are allowed`)
  }

  if (baseErrors.length > 0) errors[field.name] = baseErrors

  const inner = field.getInnerSchema()
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    const rowValues = row as Record<string, unknown>
    const rowErrors = validateSchema(inner, rowValues, record)
    for (const [childName, msgs] of Object.entries(rowErrors)) {
      errors[`${field.name}.${i}.${childName}`] = msgs
    }
  })
}

/** True when no field returned any error. */
export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0
}

/**
 * Group flat-key form-encoded Repeater rows into an array of row bodies.
 * Mirrors the same fold path as `coerceRepeaterValue` in
 * `dispatchForm.ts` but kept private here so validation works against
 * raw bodies (validation runs before coercion in `dispatchFormSubmit`).
 *
 * Returns an empty array when no matching keys exist — the Repeater's
 * `minItems` validator then surfaces the right error.
 */
function foldFlatRepeaterRows(
  values:    Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> {
  const prefix = `${fieldName}.`
  const grouped = new Map<number, Record<string, unknown>>()
  let maxIdx = -1
  for (const key of Object.keys(values)) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const dot = rest.indexOf('.')
    if (dot < 0) continue
    const idxStr = rest.slice(0, dot)
    const childKey = rest.slice(dot + 1)
    const idx = Number(idxStr)
    if (!Number.isInteger(idx) || idx < 0) continue
    if (idx > maxIdx) maxIdx = idx
    let row = grouped.get(idx)
    if (!row) { row = {}; grouped.set(idx, row) }
    row[childKey] = values[key]
  }
  if (maxIdx < 0) return []
  // Trim trailing untouched rows so `minItems` lines up with what
  // coercion will eventually persist.
  const out: Array<Record<string, unknown>> = []
  for (let i = 0; i <= maxIdx; i++) out.push(grouped.get(i) ?? {})
  while (out.length > 0 && isRowEmpty(out[out.length - 1]!)) out.pop()
  return out
}

function isRowEmpty(row: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(row)) {
    if (k === '__id') continue
    if (v === undefined || v === null || v === '') continue
    return false
  }
  return true
}

function walk(elements: Element[], visit: (el: Element) => void): void {
  for (const el of elements) {
    visit(el)
    // Plan #14 — don't recurse into Repeater children. The visitor handles
    // per-row validation by calling `validateSchema` recursively against
    // the row's local values map. Recursing here would validate inner
    // fields against the parent `values`, missing the row scope entirely.
    if (el instanceof RepeaterField) continue
    const children = el.getChildren()
    if (children && children.length > 0) walk(children, visit)
  }
}
