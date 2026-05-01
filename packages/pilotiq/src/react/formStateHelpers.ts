import type { ElementMeta } from '../schema/Element.js'

/** Walk a form's child tree and collect every Field's `defaultValue` into
 *  a flat values map keyed by field name. Used by `FormStateProvider` to
 *  seed its controlled-state map from the server's initial render. */
export function collectFieldDefaults(formMeta: ElementMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // Server already overlays form-level `values` onto each field's
  // `defaultValue` during resolveSchema, so we only need to read the
  // field's `defaultValue`. We also overlay `formMeta.values` last as a
  // safety net for any field that didn't carry a defaultValue but has a
  // matching key on the form.
  walkFields(formMeta, (field) => {
    const name = String(field['name'] ?? '')
    if (!name) return
    const defaultValue = field['defaultValue']
    if (defaultValue !== undefined) {
      out[name] = defaultValue
    } else if (!(name in out)) {
      out[name] = ''
    }
  })

  const formValues = (formMeta as { values?: Record<string, unknown> }).values
  if (formValues) {
    for (const [k, v] of Object.entries(formValues)) {
      if (v !== undefined) out[k] = v
    }
  }
  return out
}

/** Locate a Field meta by name within a form's descendants. Returns
 *  `undefined` when no match. Used by `triggerLive` to look up the
 *  field's `live` config.
 *
 *  Plan #14 — for dotted-path names like `items.0.product` (a field
 *  inside a Repeater row), walks into the Repeater's first row's
 *  children to find the inner field. The inner field's `live` config
 *  is identical for every row (it's defined once on the field), so
 *  reading from row 0 is sufficient. */
export function findFieldMeta(formMeta: ElementMeta, name: string): ElementMeta | undefined {
  if (name.includes('.')) return findFieldMetaDotted(formMeta, name)
  let found: ElementMeta | undefined
  walkFields(formMeta, (field) => {
    if (found) return
    if (String(field['name'] ?? '') === name) found = field
  })
  return found
}

/** Walk a dotted path against a form tree. Segments alternate
 *  field-name and row-index. Mirrors the server-side `resolveRepeaterPath`
 *  in `dispatchForm.ts`. */
function findFieldMetaDotted(formMeta: ElementMeta, path: string): ElementMeta | undefined {
  const segments = path.split('.')
  let currentChildren: ElementMeta[] = (formMeta.children as ElementMeta[] | undefined) ?? []
  let i = 0
  while (i < segments.length) {
    const fieldName = segments[i]
    if (fieldName === undefined) return undefined
    const field = findChildFieldByName(currentChildren, fieldName)
    if (!field) return undefined
    // Leaf — last segment was a field name.
    if (i === segments.length - 1) return field
    // Otherwise we must be inside a Repeater; the next segment is a row index.
    if (field['fieldType'] !== 'repeater') return undefined
    const idxRaw = segments[i + 1]
    if (idxRaw === undefined) return undefined
    const idx = Number(idxRaw)
    if (!Number.isInteger(idx) || idx < 0) return undefined
    // Live config is template-level; row 0's children are equivalent for
    // lookup. Fall back to the requested row when present (handles future
    // per-row schema variants without re-coding).
    const rows = (field['rows'] as Array<{ children: ElementMeta[] }> | undefined) ?? []
    const row = rows[idx] ?? rows[0]
    if (!row) {
      const tpl = (field['template'] as ElementMeta[] | undefined) ?? []
      currentChildren = tpl
    } else {
      currentChildren = row.children
    }
    i += 2
  }
  return undefined
}

/** Find a direct child field by name — non-recursive (only scans the
 *  immediate `Field` children of the given list). Layout containers are
 *  flattened first so a Field inside `Section / Card / Group / etc.`
 *  still counts as a "direct" child of the row's schema. */
function findChildFieldByName(elements: ElementMeta[], name: string): ElementMeta | undefined {
  for (const el of elements) {
    if (el.type === 'field' && String(el['name'] ?? '') === name) return el
    // Don't recurse into a Repeater's children — the dotted path handles
    // that explicitly via the next segment.
    if (el['fieldType'] === 'repeater') continue
    const children = el.children as ElementMeta[] | undefined
    if (Array.isArray(children) && children.length > 0) {
      const hit = findChildFieldByName(children, name)
      if (hit) return hit
    }
  }
  return undefined
}

/** Recursive walker — visits every `field`-typed descendant. Stops at
 *  Repeater boundaries (its row children are addressed via dotted paths,
 *  not via this walker). */
function walkFields(node: ElementMeta, visit: (field: ElementMeta) => void): void {
  if (node.type === 'field') {
    visit(node)
    if (node['fieldType'] === 'repeater') return
  }
  const children = node.children
  if (Array.isArray(children)) {
    for (const child of children) walkFields(child as ElementMeta, visit)
  }
}

/**
 * Build a nested object from FormData entries. Keys split on `.`:
 * - `name` → `{ name: 'value' }`
 * - `items.0.product` → `{ items: [{ product: 'value' }] }`
 * - `items.0.modifiers.1.name` → nested arrays of objects
 *
 * Plan #14 — used by FormStateProvider to snapshot the current DOM
 * state of a form (including uncontrolled inner-Repeater inputs)
 * before POSTing a live re-resolve. Server's `coerceFormValues` does
 * the same structural fold plus type coercion; the client just folds.
 *
 * Rules:
 * - Numeric segments after a field name → array indices.
 * - Multiple values for the same key → last one wins (matches
 *   browser-form semantics; checkbox lists handled at the field level).
 * - Reserved `__id` keys (Repeater row identity) and `_formId / _method`
 *   are filtered out — they're transport metadata, not field values.
 */
export function parseFormDataToNested(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of fd.entries()) {
    if (rawKey === '_formId' || rawKey === '_method') continue
    if (rawKey.endsWith('.__id')) continue
    // FormData values may be File or string. We only need string here —
    // file uploads pre-resolve to URL strings before live POST.
    const value = typeof rawValue === 'string' ? rawValue : ''
    writeNestedPath(out, rawKey.split('.'), value)
  }
  return out
}

/** Write a value into a nested object/array structure along a path
 *  whose segments alternate field name (string) and array index
 *  (numeric string). Creates intermediate objects/arrays as needed. */
function writeNestedPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  if (segments.length === 0) return
  let cursor: Record<string, unknown> | unknown[] = root
  for (let i = 0; i < segments.length - 1; i++) {
    const seg     = segments[i] as string
    const nextSeg = segments[i + 1] as string
    const nextIsIndex = /^\d+$/.test(nextSeg)
    if (Array.isArray(cursor)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0) return
      if (cursor[idx] === undefined) cursor[idx] = nextIsIndex ? [] : {}
      cursor = cursor[idx] as Record<string, unknown> | unknown[]
    } else {
      if (cursor[seg] === undefined) cursor[seg] = nextIsIndex ? [] : {}
      cursor = cursor[seg] as Record<string, unknown> | unknown[]
    }
  }
  const leaf = segments[segments.length - 1] as string
  if (Array.isArray(cursor)) {
    const idx = Number(leaf)
    if (!Number.isInteger(idx) || idx < 0) return
    cursor[idx] = value
  } else {
    cursor[leaf] = value
  }
}

/** Public — write a single value into a nested structure along a
 *  dotted path. Used by FormStateProvider to apply a `triggerLive`
 *  value override on top of the FormData snapshot. */
export function writeNestedValue(
  root:  Record<string, unknown>,
  path:  string,
  value: unknown,
): void {
  writeNestedPath(root, path.split('.'), value)
}
