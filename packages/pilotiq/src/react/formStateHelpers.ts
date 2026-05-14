import type { ElementMeta } from '../schema/Element.js'
import type { FormCollabBinding } from './FormCollabBindingRegistry.js'

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

/** Read a single value from a nested structure along a dotted path.
 *  Returns `undefined` for missing paths or when an intermediate
 *  segment is not a navigable container. Used by `afterStateUpdatedJs`
 *  to expose `$get('items.0.name')` to the JS handler. */
export function readNestedValue(
  root: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split('.')
  let cursor: unknown = root
  for (const seg of segments) {
    if (cursor === null || cursor === undefined) return undefined
    if (Array.isArray(cursor)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cursor = cursor[idx]
      continue
    }
    if (typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[seg]
      continue
    }
    return undefined
  }
  return cursor
}

/**
 * Phase F.5 — parsed row-field coordinates.
 *
 * `fieldName` is the leaf field's name as declared in the inner schema
 * (e.g. the `TextField.make('label')` inside a `Repeater.schema([...])`).
 * Builder rows wrap their inner schema under a literal `data` segment;
 * `parseRowFieldPath` strips that segment so consumers don't need to
 * know which row-array dialect they're addressing.
 */
export interface ParsedRowFieldPath {
  arrayName: string
  index:     number
  fieldName: string
}

/**
 * Phase F.5 — parse a dotted form-field name into row-array coordinates
 * when it matches a Repeater or Builder row-leaf shape; return `null`
 * otherwise. Used by `FormStateProvider` to route row-leaf writes
 * through `FormCollabBinding.setRow` instead of skipping them.
 *
 *   `tags.0.label`        → { arrayName: 'tags',   index: 0, fieldName: 'label' }  (Repeater)
 *   `blocks.0.data.body`  → { arrayName: 'blocks', index: 0, fieldName: 'body'  }  (Builder)
 *   `tags.0.__id`         → null   (row identity — handled by addRow / reorderRows)
 *   `blocks.0.type`       → null   (Builder block discriminator — not a user field)
 *   `foo`                 → null   (top-level field — top-level binding.set path)
 *   `tags.notnum.label`   → null   (malformed)
 *
 * Nested Repeaters / Builders (e.g. `articles.0.comments.1.body`) are
 * out of scope v1 — they return `null` here too. F.5b's binding impl
 * therefore never sees them and they continue to ride the local-state
 * path until a future phase opens the door.
 */
export function parseRowFieldPath(path: string): ParsedRowFieldPath | null {
  const segments = path.split('.')
  if (segments.length === 3) {
    const [arrayName, idxRaw, fieldName] = segments as [string, string, string]
    if (!/^\d+$/.test(idxRaw)) return null
    if (!arrayName || !fieldName) return null
    if (fieldName === '__id' || fieldName === 'type') return null
    return { arrayName, index: Number(idxRaw), fieldName }
  }
  if (segments.length === 4 && segments[2] === 'data') {
    const [arrayName, idxRaw, , fieldName] = segments as [string, string, string, string]
    if (!/^\d+$/.test(idxRaw)) return null
    if (!arrayName || !fieldName) return null
    return { arrayName, index: Number(idxRaw), fieldName }
  }
  return null
}

/**
 * Phase F.5 — resolve the stable `__id` of the row at `arrayName[index]`
 * from a flat dotted-path values map. The renderer mints `__id` on every
 * row insert (UUID for new / DB PK for relationship-backed) so callers
 * here are looking up an id that already exists; returns `null` only
 * when the row hasn't been registered yet (e.g. the binding observed a
 * remote insert before the local renderer rebuilt its row map).
 *
 * The lookup always reads from the flat shape (`${arrayName}.${index}.__id`)
 * since both `FormStateProvider`'s `valuesRef` and server-resolve responses
 * use flat dotted-path keys.
 */
export function rowIdAtIndex(
  values:    Record<string, unknown>,
  arrayName: string,
  index:     number,
): string | null {
  const flat = values[`${arrayName}.${index}.__id`]
  if (typeof flat === 'string' && flat.length > 0) return flat
  return null
}

/**
 * Phase F2 — returns `true` iff the named field has explicitly opted out
 * of realtime collab via `Field.collab(false)`. Sparse meta — absent =
 * inherit the panel default (collab on). Walks the form meta tree the
 * same way `findFieldMeta` does. Cheap (one map lookup per write).
 *
 * Exposed so `routeBindingWrite` can compose against it from this
 * module instead of FormStateContext's private helper.
 */
export function fieldOptsOutOfCollab(formMeta: ElementMeta, name: string): boolean {
  const meta = findFieldMeta(formMeta, name) as { collab?: boolean } | undefined
  return meta?.collab === false
}

/**
 * Phase F.5 — route a single (name, value) write through the collab
 * binding by name shape:
 *
 *   - top-level name  → `binding.set(name, value)`           (F2 path)
 *   - row leaf        → `binding.setRow(arrayName, rowId, fieldName, value)`
 *                       when the binding implements F.5; falls through
 *                       to no-op otherwise (v1 skip-on-dot behaviour).
 *
 * Skips when no binding is registered or the field opted out via
 * `.collab(false)`. `valuesForLookup` supplies the rowId map — pass the
 * latest snapshot the caller has access to (`valuesRef.current` for
 * local writes; merged `valuesRef + serverValues` for server-resolve).
 *
 * Shared between `setValue` (local edits) and the server-resolve overlay
 * inside `performLivePost` so both routing decisions stay in lockstep.
 */
export function routeBindingWrite(
  binding:         FormCollabBinding | null,
  formMeta:        ElementMeta | undefined,
  valuesForLookup: Record<string, unknown>,
  name:            string,
  value:           unknown,
): void {
  if (!binding) return
  if (formMeta && fieldOptsOutOfCollab(formMeta, name)) return
  if (!name.includes('.')) {
    binding.set(name, value)
    return
  }
  if (!binding.setRow) return   // pre-F.5 binding — row leaves stay local
  const parsed = parseRowFieldPath(name)
  if (!parsed) return           // nested-Repeater / malformed — out of scope v1
  const rowId = rowIdAtIndex(valuesForLookup, parsed.arrayName, parsed.index)
  if (!rowId) return            // row not yet stamped — local-only until id lands
  binding.setRow(parsed.arrayName, rowId, parsed.fieldName, value)
}

/**
 * Phase F.5 — walk a form's meta tree for top-level Repeater / Builder
 * field names. Used by `FormStateProvider` to build the per-array
 * `RowBindingApi` map from a single meta walk at binding mount.
 *
 * Stops at the array boundary itself — we want the array's own field
 * name, not the inner-row fields inside it (which address through
 * `setRow`'s dotted-path routing, not through their own row bindings).
 * Skips fields opted out via `.collab(false)` so the array is left on
 * the v1 local-state path.
 */
export function collectRowArrayFieldNames(formMeta: ElementMeta): string[] {
  const out: string[] = []
  walk(formMeta)
  return out

  function walk(node: ElementMeta): void {
    if (node.type === 'field') {
      const fieldType = node['fieldType']
      if (fieldType === 'repeater' || fieldType === 'builder') {
        if ((node as { collab?: boolean }).collab !== false) {
          const name = String(node['name'] ?? '')
          if (name) out.push(name)
        }
        // Don't descend — inner row fields address through dotted-path
        // routing, not their own row bindings.
        return
      }
    }
    const children = node.children
    if (Array.isArray(children)) {
      for (const child of children) walk(child as ElementMeta)
    }
  }
}
