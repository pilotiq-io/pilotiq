/**
 * Pure value-coercion helpers for custom-block (`pilotiqBlock`) form data.
 *
 * The inline accordion editor in `BlockNodeView` snapshots its `<form>` via
 * `new FormData(formEl)` → `parseFormDataToNested` (rebuilds nested arrays /
 * objects from dotted-path inputs like `items.0.title`) → `coerceBlockValues`
 * (per-fieldType JSON parse / boolean / number coerce so nested-shape fields
 * round-trip in their canonical wire form) before writing the result back onto
 * the node via `updateAttributes({ blockData })`.
 *
 * No React, no DOM, no editor — exported for unit tests.
 */

/**
 * Per-fieldType coerce of a nested values map (built by
 * `parseFormDataToNested`) against the block's schema. Mirrors the
 * server-side `coerceFormValues` at a small subset suitable for the
 * inline block editor — top-level block fields plus the immediate
 * children of any Repeater rows / Builder rows.data.
 *
 * Non-coerce passthrough for: text, textarea, select, radio, date,
 * dateTime, email, color, toggleButtons, slug, hidden. (Their wire shape
 * is already a plain string / array of strings.)
 *
 * Coerce branches:
 * - `toggle` / `checkbox`: 'true' / 'false' string → boolean.
 * - `number` / `slider`: parse to Number, null on empty, raw string
 *   passthrough on NaN (so a half-typed value isn't lost).
 * - `tagsInput`: JSON-encoded string → string[].
 * - `checkboxList`: JSON-encoded string OR array → string[].
 * - `keyValue`: JSON-encoded string → Record<string, unknown>.
 * - `fileUpload`: single → URL string passthrough; multiple →
 *   JSON-encoded string → string[].
 * - `repeater`: each row in the array gets recursive coerce against
 *   the field's `template` (the inner field schema definition).
 * - `builder`: each row's `data` gets recursive coerce against the
 *   block matching `row.type` from `field.blocks[]`. Unknown block
 *   types pass through verbatim — the renderer shows a placeholder
 *   and the data round-trips intact across config rollbacks.
 */
export function coerceBlockValues(
  raw:    Record<string, unknown>,
  schema: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  for (const field of schema) {
    const name = String(field['name'] ?? '')
    if (!name) continue
    const ft = String(field['fieldType'] ?? 'text')
    const value = out[name]
    out[name] = coerceField(value, ft, field)
  }
  return out
}

function coerceField(
  value: unknown,
  ft:    string,
  field: Record<string, unknown>,
): unknown {
  switch (ft) {
    case 'toggle':
    case 'checkbox':
      return value === 'true' || value === true
    case 'number':
    case 'slider':
      return coerceNumber(value)
    case 'tagsInput':
      return parseJsonArray(value)
    case 'checkboxList':
      return parseJsonArray(value)
    case 'keyValue':
      return parseJsonObject(value)
    case 'fileUpload': {
      const multiple = Boolean(field['multiple'])
      if (multiple) return parseJsonArray(value)
      return typeof value === 'string' ? value : ''
    }
    case 'repeater': {
      if (!Array.isArray(value)) return []
      const template = (field['template'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
      return value.map((row) => {
        if (!row || typeof row !== 'object') return {}
        return coerceBlockValues(row as Record<string, unknown>, template)
      })
    }
    case 'builder': {
      if (!Array.isArray(value)) return []
      const blockMetas = (field['blocks'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
      return value.map((row) => {
        if (!row || typeof row !== 'object') return { type: '', data: {} }
        const r = row as Record<string, unknown>
        const type = String(r['type'] ?? '')
        const data = (r['data'] as Record<string, unknown> | undefined) ?? {}
        const block = blockMetas.find((b) => String(b['name'] ?? '') === type)
        if (!block) return { type, data }
        const tpl = (block['template'] as ReadonlyArray<Record<string, unknown>> | undefined) ?? []
        return { type, data: coerceBlockValues(data, tpl) }
      })
    }
    default:
      return value === undefined ? '' : value
  }
}

function coerceNumber(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const raw = String(value)
  if (raw === '') return null
  const n = Number(raw)
  return Number.isNaN(n) ? raw : n
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string' || value === '') return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch { /* fall through */ }
  return {}
}

/**
 * Parse a `pilotiqBlock` node's `blockData` attr into a plain object.
 *
 * `blockData` is stored on the node as a JSON **string** (not an object): the
 * node is a contentless leaf whose whole state lives in that attr, and under
 * realtime collab the attr syncs through y-prosemirror, whose PM↔Yjs attribute
 * sync is string-oriented — an object-valued attr doesn't round-trip and drops
 * the node (issue #96). Reads still tolerate the legacy object form so docs
 * saved before the string migration keep loading; the next write migrates them.
 */
export function parseBlockData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string' && raw !== '') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch { /* fall through to empty */ }
  }
  return {}
}

/** Serialize a block-data object to the JSON string stored on the node attr.
 *  The inverse of {@link parseBlockData} — see it for why the attr is a string. */
export function serializeBlockData(data: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(data ?? {})
}

/**
 * Read the resolved field value for a given input event target. Maps a
 * single-input change onto its coerced wire shape — string passthrough
 * for the common case; explicit coercion for booleans and numerics so
 * the round-trip into the node attrs preserves shape. Exported for tests.
 */
export function readBlockFieldValue(
  target:    { type?: string; value: string; checked?: boolean },
  fieldMeta: { fieldType?: unknown },
): unknown {
  const ft = String(fieldMeta.fieldType ?? 'text')
  if (ft === 'toggle' || ft === 'checkbox') {
    return target.checked === true
  }
  if (ft === 'number' || ft === 'slider') {
    const raw = target.value
    if (raw === '') return null
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  return target.value
}
