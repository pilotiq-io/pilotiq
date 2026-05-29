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
