/**
 * Validation primitives.
 *
 * A `Validator` is a function: `(value, ctx?) => string | null | Promise<string | null>`.
 * It returns an error message when invalid, or `null` when the value
 * passes. Validators may carry an optional `serialized` descriptor — a
 * JSON-safe shape mirrored to the client via `Field.toMeta()` so the
 * browser can run the same rule for live UX before submit.
 *
 * The runtime is server-of-truth: client-side mirroring is best-effort.
 * If `serialized` is omitted, the validator runs only on the server.
 *
 * Async validators (e.g. `unique()` probing the DB) return a `Promise`;
 * the pipeline awaits each result before collecting the next field's
 * errors. They are NOT mirrored to the client — the descriptor is omitted
 * or marks itself `async: true` so the client skips the live check.
 */

/** JSON-safe descriptor of a built-in rule. Mirrored to the client. */
export interface SerializedRule {
  rule: string
  message?: string
  [key: string]: unknown
}

/**
 * Optional context passed to a validator. `values` is the full submit
 * payload — useful for cross-field rules (e.g. confirm-password). `record`
 * is the persisted record under edit, when present.
 */
export interface ValidatorContext {
  values?: Record<string, unknown>
  record?: unknown
}

export type ValidatorFn = (
  value: unknown,
  ctx?:  ValidatorContext,
) => string | null | Promise<string | null>

/** A validator function, optionally tagged with a serialized descriptor. */
export type Validator = ValidatorFn & { serialized?: SerializedRule }

/** Wrap a `ValidatorFn` and attach an optional serialized descriptor. */
export function makeValidator(fn: ValidatorFn, serialized?: SerializedRule): Validator {
  const v = fn as Validator
  if (serialized) v.serialized = serialized
  return v
}
