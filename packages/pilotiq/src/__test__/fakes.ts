// Shared fakes for render tests. Keep these small and explicit — a fake
// that drifts from the real wire shape produces tests that pass against
// fiction. The shapes here mirror `resolveSchema`'s output (`type: 'field'`
// leaves under a `type: 'form'` root) and the form-state POST response.
import type { ElementMeta } from '../schema/Element.js'

/** A resolved field-meta leaf, as `SchemaRenderer` receives it. */
export function fakeFieldMeta(name: string, overrides: Record<string, unknown> = {}): ElementMeta {
  return { type: 'field', name, fieldType: 'text', ...overrides }
}

/** A resolved form root wrapping the given field leaves. */
export function fakeFormMeta(
  fields: ElementMeta[] = [],
  overrides: Record<string, unknown> = {},
): ElementMeta {
  return { type: 'form', children: fields, ...overrides }
}

/** A plain record object for table / detail tests. */
export function fakeRecord(values: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 1, ...values }
}

/**
 * A `fetch` stub for the form-state / cell-edit / reorder POST endpoints.
 * `handler` receives the parsed JSON body and returns the response payload
 * (defaults to `{ ok: true }`). Use via the provider's `fetchImpl` seam:
 *
 *   renderWithProviders(ui, { fetchImpl: jsonFetch(body => ({ ok: true, form: nextMeta })) })
 */
export function jsonFetch(
  handler: (body: unknown, url: string) => unknown = () => ({ ok: true }),
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    let body: unknown
    try { body = init?.body ? JSON.parse(String(init.body)) : undefined } catch { body = init?.body }
    const payload = handler(body, url)
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as Response
  }) as typeof fetch
}

export interface FetchCall { url: string; init?: RequestInit }

/**
 * Replace the global `fetch` with a stub for components that call it directly
 * (e.g. `FormRenderer`, which submits via the global `fetch`, not a seam).
 * `responder` returns `{ status?, json? }` per call (defaults to 200 `{}`).
 * Records every call; `restore()` puts the real `fetch` back — call it in an
 * `afterEach`.
 */
export function installFetch(
  responder: (call: FetchCall) => { status?: number; json?: unknown } = () => ({}),
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, ...(init ? { init } : {}) })
    const { status = 200, json = {} } = responder({ url, ...(init ? { init } : {}) })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as Response
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}
