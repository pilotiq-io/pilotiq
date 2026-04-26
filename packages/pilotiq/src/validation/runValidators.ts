import { Element } from '../schema/Element.js'
import { Field } from '../fields/Field.js'

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
 */
export function validateSchema(
  elements: Element[],
  values: Record<string, unknown>,
  record?: unknown,
): ValidationErrors {
  const errors: ValidationErrors = {}
  walk(elements, el => {
    if (!(el instanceof Field)) return
    const value = values[el.name]
    const ctx: { values: Record<string, unknown>; record?: unknown } = { values }
    if (record !== undefined) ctx.record = record
    const fieldErrors = el.runValidators(value, ctx)
    if (fieldErrors.length > 0) errors[el.name] = fieldErrors
  })
  return errors
}

/** True when no field returned any error. */
export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0
}

function walk(elements: Element[], visit: (el: Element) => void): void {
  for (const el of elements) {
    visit(el)
    const children = el.getChildren()
    if (children && children.length > 0) walk(children, visit)
  }
}
