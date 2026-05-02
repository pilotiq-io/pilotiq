import { Element } from '../schema/Element.js'
import { Field } from '../fields/Field.js'
import { RepeaterField } from '../fields/RepeaterField.js'
import { BuilderField } from '../fields/BuilderField.js'

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
 *
 * Async — `Field.runValidators` is awaited per field, so async validators
 * (e.g. `unique()` probing the DB) work transparently. The walker is still
 * sequential per field within the same scope to preserve declaration order
 * in the error output; cross-field parallelism would only matter on forms
 * with many DB-probing validators and is left for a future profile.
 */
export async function validateSchema(
  elements: Element[],
  values:   Record<string, unknown>,
  record?:  unknown,
): Promise<ValidationErrors> {
  const errors: ValidationErrors = {}
  const fields:    Field[]         = []
  const repeaters: RepeaterField[] = []
  const builders:  BuilderField[]  = []

  // Two-pass to preserve order: collect first (sync walk), then await each.
  walk(elements, el => {
    if (el instanceof RepeaterField) { repeaters.push(el); return }
    if (el instanceof BuilderField)  { builders.push(el);  return }
    if (el instanceof Field) fields.push(el)
  })

  for (const el of fields) {
    const value = values[el.name]
    const ctx: { values: Record<string, unknown>; record?: unknown } = { values }
    if (record !== undefined) ctx.record = record
    const fieldErrors = await el.runValidators(value, ctx)
    if (fieldErrors.length > 0) errors[el.name] = fieldErrors
  }

  for (const rep of repeaters) {
    const raw = values[rep.name]
    const rows = Array.isArray(raw) ? raw : foldFlatRepeaterRows(values, rep.name)
    await validateRepeater(rep, rows, record, errors)
  }

  for (const bld of builders) {
    const raw = values[bld.name]
    const rows = Array.isArray(raw) ? raw : foldFlatBuilderRows(values, bld.name)
    await validateBuilder(bld, rows, record, errors)
  }

  return errors
}

async function validateRepeater(
  field:  RepeaterField,
  raw:    unknown,
  record: unknown,
  errors: ValidationErrors,
): Promise<void> {
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
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const rowValues = row as Record<string, unknown>
    const rowErrors = await validateSchema(inner, rowValues, record)
    for (const [childName, msgs] of Object.entries(rowErrors)) {
      errors[`${field.name}.${i}.${childName}`] = msgs
    }
  }
}

/**
 * Validate a single Builder field's rows. Per-row errors are flat-keyed
 * `${field.name}.${i}.data.${childName}` so the client can surface them
 * inline on the right row's inner field. `minItems` / `maxItems` /
 * `Block.maxItems` (per-block-type ceiling) and unknown-block-type
 * errors land under the bare builder name.
 */
async function validateBuilder(
  field:  BuilderField,
  raw:    unknown,
  record: unknown,
  errors: ValidationErrors,
): Promise<void> {
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

  // Per-block-type ceiling (`Block.maxItems`) is enforced post-row-walk
  // so we can count the rows of each type in one pass.
  const typeCounts = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const t = (row as Record<string, unknown>)['type']
    if (typeof t === 'string' && t !== '') {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
    }
  }
  for (const block of field.getBlocks()) {
    const cap = block.getMaxItems()
    if (cap === undefined) continue
    const count = typeCounts.get(block.name) ?? 0
    if (count > cap) {
      baseErrors.push(cap === 1
        ? `At most 1 "${block.getLabel()}" block is allowed`
        : `At most ${cap} "${block.getLabel()}" blocks are allowed`)
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const t = r['type']
    if (typeof t !== 'string' || t === '') {
      errors[`${field.name}.${i}`] = ['Block type is required']
      continue
    }
    const block = field.getBlock(t)
    if (!block) {
      errors[`${field.name}.${i}`] = [`Unknown block type "${t}"`]
      continue
    }
    const dataRaw = r['data']
    const data: Record<string, unknown> = (dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw))
      ? (dataRaw as Record<string, unknown>)
      : {}
    const rowErrors = await validateSchema(block.getSchema(), data, record)
    for (const [childName, msgs] of Object.entries(rowErrors)) {
      errors[`${field.name}.${i}.data.${childName}`] = msgs
    }
  }

  if (baseErrors.length > 0) errors[field.name] = baseErrors
}

/**
 * Group flat-key form-encoded Builder rows into an array of row bodies
 * shaped `{ __id?, type, data: {…} }`. Mirrors `coerceBuilderValue` in
 * `dispatchForm.ts`. Validation runs before coercion so we can't reuse
 * the coerced array directly.
 */
function foldFlatBuilderRows(
  values:    Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> {
  const prefix  = `${fieldName}.`
  const grouped = new Map<number, { __id?: string; type: string; data: Record<string, unknown> }>()
  let maxIdx = -1
  for (const key of Object.keys(values)) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const dot  = rest.indexOf('.')
    if (dot < 0) continue
    const idxStr = rest.slice(0, dot)
    const tail   = rest.slice(dot + 1)
    const idx    = Number(idxStr)
    if (!Number.isInteger(idx) || idx < 0) continue
    if (idx > maxIdx) maxIdx = idx
    let row = grouped.get(idx)
    if (!row) { row = { type: '', data: {} }; grouped.set(idx, row) }
    const value = values[key]
    if (tail === '__id') {
      if (typeof value === 'string') row.__id = value
    } else if (tail === 'type') {
      if (typeof value === 'string') row.type = value
    } else if (tail.startsWith('data.')) {
      row.data[tail.slice('data.'.length)] = value
    }
  }
  if (maxIdx < 0) return []
  const out: Array<Record<string, unknown>> = []
  for (let i = 0; i <= maxIdx; i++) {
    const row = grouped.get(i) ?? { type: '', data: {} }
    const obj: Record<string, unknown> = { type: row.type, data: row.data }
    if (typeof row.__id === 'string') obj['__id'] = row.__id
    out.push(obj)
  }
  while (out.length > 0 && isBuilderRowEmpty(out[out.length - 1]!)) out.pop()
  return out
}

function isBuilderRowEmpty(row: Record<string, unknown>): boolean {
  const data = row['data']
  if (!data || typeof data !== 'object' || Array.isArray(data)) return true
  for (const [, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue
    return false
  }
  return true
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
    // Plan #14 — don't recurse into Repeater / Builder children. The
    // visitor handles per-row validation by calling `validateSchema`
    // recursively against the row's local values map (per-block schema
    // for Builder). Recursing here would validate inner fields against
    // the parent `values`, missing the row scope entirely.
    if (el instanceof RepeaterField) continue
    if (el instanceof BuilderField)  continue
    const children = el.getChildren()
    if (children && children.length > 0) walk(children, visit)
  }
}
