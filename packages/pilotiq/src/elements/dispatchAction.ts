import { Action, type ActionContext, type NotificationLike } from '../actions/Action.js'
import type { Element } from '../schema/Element.js'
import { validateSchema, type ValidationErrors } from '../validation/index.js'
import { coerceFormValues } from './dispatchForm.js'
import { Notification, type NotificationMeta } from '../notifications/Notification.js'

/**
 * Walk an Element tree and return every `Action` instance in document
 * order. Mirrors `findForms` / `findTables`.
 */
export function findActions(elements: ReadonlyArray<Element>): Action[] {
  const actions: Action[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el instanceof Action) actions.push(el)
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return actions
}

/**
 * Body shape parsed off a `POST {base}/.../_action/{name}` request.
 * `ids` carries the records the action operates on (one element for row
 * actions, many for bulk, none for header). `values` is everything else
 * the client sent — typically dialog-form fields.
 */
export interface ActionRequestInput {
  ids:    string[]
  values: Record<string, unknown>
}

/** Parse a posted body into `{ ids, values }`. */
export function parseActionBody(body: Record<string, unknown>): ActionRequestInput {
  const idsRaw = body['ids']
  let ids: string[] = []
  if (Array.isArray(idsRaw)) {
    ids = idsRaw.map(v => String(v))
  } else if (typeof idsRaw === 'string') {
    // form-encoded "ids=a&ids=b" can collapse to a single string; allow CSV.
    ids = idsRaw.includes(',') ? idsRaw.split(',').map(s => s.trim()).filter(Boolean) : [idsRaw]
  }

  const values: Record<string, unknown> = { ...body }
  delete values['ids']
  delete values['_actionName']
  return { ids, values }
}

export type ResolveRecord = (id: string) => Promise<unknown> | unknown

export interface DispatchActionInput extends ActionRequestInput {
  request?: unknown
}

export interface DispatchActionSuccess {
  ok:           true
  redirect?:    string
  /** Notifications the handler emitted via the return shape `{ notify }`.
   * Forwarded by the route layer either inline (JSON dispatch) or as
   * a flash payload through the redirect (HTML dispatch). */
  notifications?: NotificationMeta[]
}

export interface DispatchActionFailure {
  ok:     false
  error:  string
  /** Per-field validation errors when the action's modal-form schema
   * rejected the submitted values. Populated only on validation failure;
   * absent for handler exceptions. */
  errors?: ValidationErrors
}

export type DispatchActionResult = DispatchActionSuccess | DispatchActionFailure

/**
 * Run an Action's server-side handler with a built-up `ActionContext`.
 *
 * - `ids.length === 0` → no `record`/`records` (header action)
 * - `ids.length === 1` → `ctx.record` (row / single-target action)
 * - `ids.length > 1`  → `ctx.records` (bulk action)
 *
 * When `resolveRecord` is supplied (e.g. a `Resource.model.find` adapter
 * the route handler builds), each id is hydrated through it. Otherwise
 * `ctx.record` / `ctx.records` carry bare `{ id }` stubs so the handler
 * still has *something* to key off.
 *
 * Returns a `DispatchActionResult` rather than throwing so the caller can
 * map it onto an HTTP response uniformly. Errors thrown by the handler
 * are caught and wrapped into `{ ok: false, error }`.
 */
export async function dispatchAction(
  action: Action,
  input:  DispatchActionInput,
  resolveRecord?: ResolveRecord,
): Promise<DispatchActionResult> {
  const handler = action.getHandler()
  if (!handler) {
    return {
      ok:    false,
      error: `[Pilotiq] Action "${action.name}" has no handler. Set Action.handler(...) to enable dispatch.`,
    }
  }

  const ctx: ActionContext = { values: input.values }
  if (input.request !== undefined) ctx.request = input.request

  if (input.ids.length === 1) {
    const id = input.ids[0]!
    ctx.record = resolveRecord ? await resolveRecord(id) : { id }
  } else if (input.ids.length > 1) {
    ctx.records = resolveRecord
      ? await Promise.all(input.ids.map(id => Promise.resolve(resolveRecord(id))))
      : input.ids.map(id => ({ id }))
  }

  // Form-modal action — validate the submitted values against the action's
  // schema, then coerce strings into runtime types (booleans/numbers/Dates)
  // before invoking the handler. Action without `.schema()` skips both
  // (degenerate confirm-only / no-modal cases).
  if (action.hasModal()) {
    const schema = action.getSchema()
    if (schema.length > 0) {
      const errors = validateSchema(schema, input.values, ctx.record)
      if (Object.keys(errors).length > 0) {
        return { ok: false, error: 'validation', errors }
      }
      ctx.values = coerceFormValues(schema, input.values)
    }
  }

  try {
    const result = await handler(ctx)
    const success: DispatchActionSuccess = { ok: true }
    if (result && typeof result === 'object') {
      if (typeof result.redirect === 'string') success.redirect = result.redirect
      if (result.notify !== undefined) {
        const notifs = normalizeNotifications(result.notify)
        if (notifs.length > 0) success.notifications = notifs
      }
    }
    return success
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : 'Action failed',
    }
  }
}

/** Coerce the loose `NotificationLike` shape (single / array / built /
 * meta) into a flat `NotificationMeta[]`. */
function normalizeNotifications(input: NotificationLike): NotificationMeta[] {
  const arr = Array.isArray(input) ? input : [input]
  const out: NotificationMeta[] = []
  for (const n of arr) {
    if (n instanceof Notification) out.push(n.toMeta())
    else if (n && typeof n === 'object') out.push(n as NotificationMeta)
  }
  return out
}
