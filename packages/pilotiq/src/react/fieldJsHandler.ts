/**
 * Tier-2 follow-up to Plan #5 — `Field.afterStateUpdatedJs(body)`.
 *
 * Compiles a user-provided JS body string into a callable function and
 * caches the result by source identity. The body sees three names:
 *
 *   $state — the changed field's new value
 *   $get   — read a sibling field's current value
 *   $set   — write a sibling field's value (no cascade)
 *
 * Treated as admin-trusted code: written at schema-definition time,
 * never derived from request input. Uses `new Function` (CSP
 * `unsafe-eval` required); compile / run failures are caught and
 * `console.error`'d so a bad handler never breaks the form.
 */

type GetFn = (name: string) => unknown
type SetFn = (name: string, value: unknown) => void

type HandlerFn = (state: unknown, $get: GetFn, $set: SetFn) => void

type CompiledHandler =
  | { ok: true;  fn: HandlerFn }
  | { ok: false; error: string }

const handlerCache = new Map<string, CompiledHandler>()

function compileHandler(body: string, fieldName: string): CompiledHandler {
  const cached = handlerCache.get(body)
  if (cached) return cached

  try {
    // Prepend a sourceURL pragma so devtools attribute thrown frames to a
    // stable, identifiable name instead of the anonymous "Function" frame.
    const source = `'use strict';\n${body}\n//# sourceURL=pilotiq:afterStateUpdatedJs:${fieldName}`
    const fn = new Function('$state', '$get', '$set', source) as HandlerFn
    const entry: CompiledHandler = { ok: true, fn }
    handlerCache.set(body, entry)
    return entry
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const entry: CompiledHandler = { ok: false, error }
    handlerCache.set(body, entry)
    console.error(`[pilotiq] afterStateUpdatedJs compile failed for "${fieldName}":`, err)
    return entry
  }
}

export interface RunJsHandlerArgs {
  body:      string
  fieldName: string
  state:     unknown
  $get:      GetFn
  $set:      SetFn
}

/** Compile (cached) and run the JS body. Throws inside the body are
 *  caught + logged; the form is left untouched on failure. Compile
 *  failures are also cached so we don't re-attempt every change. */
export function runJsHandler({ body, fieldName, state, $get, $set }: RunJsHandlerArgs): void {
  const compiled = compileHandler(body, fieldName)
  if (!compiled.ok) return

  try {
    // Invoke with `.call(undefined, …)` so the body's `this` is `undefined`
    // (in strict mode). A bare `compiled.fn(…)` would bind `this` to the
    // cache entry object — leaking the framework's internals into the
    // user-supplied JS.
    compiled.fn.call(undefined, state, $get, $set)
  } catch (err) {
    console.error(`[pilotiq] afterStateUpdatedJs run failed for "${fieldName}":`, err)
  }
}

/** Test-only: clear the compile cache between runs. Production code
 *  has no reason to call this. */
export function __clearJsHandlerCacheForTests(): void {
  handlerCache.clear()
}
