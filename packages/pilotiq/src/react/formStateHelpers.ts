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
 *  field's `live` config. */
export function findFieldMeta(formMeta: ElementMeta, name: string): ElementMeta | undefined {
  let found: ElementMeta | undefined
  walkFields(formMeta, (field) => {
    if (found) return
    if (String(field['name'] ?? '') === name) found = field
  })
  return found
}

/** Recursive walker — visits every `field`-typed descendant. */
function walkFields(node: ElementMeta, visit: (field: ElementMeta) => void): void {
  if (node.type === 'field') visit(node)
  const children = node.children
  if (Array.isArray(children)) {
    for (const child of children) walkFields(child as ElementMeta, visit)
  }
}
