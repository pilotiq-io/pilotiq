import { Action, type ActionContext, type DownloadEnvelope, type NotificationLike } from '../actions/Action.js'
import type { Element } from '../schema/Element.js'
import { isRepeaterField, RepeaterField } from '../fields/RepeaterField.js'
import { isBuilderField, BuilderField } from '../fields/BuilderField.js'
import { validateSchema, type ValidationErrors } from '../validation/index.js'
import { coerceFormValues } from './dispatchForm.js'
import { Notification, type NotificationMeta } from '../notifications/Notification.js'

/**
 * Walk an Element tree and return every `Action` instance in document
 * order. Mirrors `findForms`. Uses a structural `getType()` check
 * instead of `instanceof Action` for the same reason as `findForms` —
 * Vite's SSR module cache can load the package via two paths during a
 * single dev session, and `instanceof` returns false across module
 * copies.
 */
export function findActions(elements: ReadonlyArray<Element>): Action[] {
  const actions: Action[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (el.getType() === 'action') actions.push(el as Action)
      // Plan #14 — actions inside a Repeater / Builder row aren't
      // supported for dispatch in v1 (no row context on the handler).
      // Stop the walk at the array-row boundary so a misplaced action
      // doesn't mis-route to the parent dispatcher.
      if (isRepeaterField(el)) continue
      if (isBuilderField(el))  continue
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return actions
}

/**
 * Walk an Element tree and return every `Action` registered as an
 * `extraItemActions(...)` button on a Repeater or Builder field. Used by
 * the action-dispatch route handler when the submit body carries
 * `_rowPath`: at that point we need to look up the action *inside* a row
 * scope rather than at page level (the regular `findActions` walker
 * deliberately stops at array-row boundaries).
 *
 * Each returned entry carries the parent field reference so the
 * dispatcher can validate that the body's `_rowPath` matches an
 * actually-registered field (and not e.g. a fabricated path pointing at
 * an unrelated repeater that happens to have an action with the same
 * name). The entry's `field.name` is used to namespace dispatch.
 */
export interface FoundRowAction {
  action:    Action
  field:     RepeaterField | BuilderField
  fieldName: string
}

export function findRowExtraActions(
  elements: ReadonlyArray<Element>,
): FoundRowAction[] {
  const out: FoundRowAction[] = []
  const walk = (els: ReadonlyArray<Element>): void => {
    for (const el of els) {
      if (isRepeaterField(el) || isBuilderField(el)) {
        const f = el as RepeaterField | BuilderField
        for (const action of f.getExtraItemActions()) {
          out.push({ action, field: f, fieldName: f.name })
        }
        // Don't recurse INTO the row schema (page-level walker semantics
        // already cover those — and inner Repeater/Builder fields can
        // carry their own extraItemActions, addressed via deeper paths).
        const inner = el instanceof RepeaterField ? el.getInnerSchema() : []
        if (inner.length > 0) walk(inner)
        if (el instanceof BuilderField) {
          for (const block of el.getBlocks()) walk(block.getSchema())
        }
        continue
      }
      const children = el.getChildren()
      if (children && children.length > 0) walk(children)
    }
  }
  walk(elements)
  return out
}

/**
 * Body shape parsed off a `POST {base}/.../_action/{name}` request.
 * `ids` carries the records the action operates on (one element for row
 * actions, many for bulk, none for header). `values` is everything else
 * the client sent — typically dialog-form fields.
 *
 * `rowPath` is set only when this submit was triggered from a Repeater
 * or Builder `extraItemActions` button. The format mirrors the wire
 * shape used elsewhere — `<fieldName>.<index>` for top-level array-row
 * fields. Nested array fields aren't supported in v1; the dispatcher
 * rejects deeper paths.
 */
export interface ActionRequestInput {
  ids:      string[]
  values:   Record<string, unknown>
  rowPath?: string
}

/** Parse a posted body into `{ ids, values, rowPath? }`. */
export function parseActionBody(body: Record<string, unknown>): ActionRequestInput {
  const idsRaw = body['ids']
  let ids: string[] = []
  if (Array.isArray(idsRaw)) {
    ids = idsRaw.map(v => String(v))
  } else if (typeof idsRaw === 'string') {
    // form-encoded "ids=a&ids=b" can collapse to a single string; allow CSV.
    ids = idsRaw.includes(',') ? idsRaw.split(',').map(s => s.trim()).filter(Boolean) : [idsRaw]
  }

  const rowPathRaw = body['_rowPath']
  const rowPath = typeof rowPathRaw === 'string' && rowPathRaw.length > 0 ? rowPathRaw : undefined

  const values: Record<string, unknown> = { ...body }
  delete values['ids']
  delete values['_actionName']
  delete values['_rowPath']
  const out: ActionRequestInput = { ids, values }
  if (rowPath !== undefined) out.rowPath = rowPath
  return out
}

export type ResolveRecord = (id: string) => Promise<unknown> | unknown

export interface DispatchActionInput extends ActionRequestInput {
  request?: unknown
  /**
   * For row-scoped extraItemActions dispatch: the parent Repeater/Builder
   * field that owns this action, plus the form's full Element schema.
   * The dispatcher uses these to (a) coerce the submit body so row paths
   * resolve, (b) pluck the row from the parent field's array, and (c)
   * stamp `ctx.row` on the handler context.
   *
   * When omitted, `rowPath` is treated as "no row scope" even if set on
   * the body — the dispatcher won't blindly trust client-supplied row
   * paths for non-row actions.
   */
  rowField?:  RepeaterField | BuilderField
  formSchema?: Element[]
  /**
   * For relation-manager-scoped dispatch: the loaded parent record + ids.
   * Stamped onto `ctx.relation` so M2M handlers (`relationAttach /
   * relationBulkDetach`) can call `parent.related(rel).attach / detach`
   * without re-loading the parent or threading it through closures.
   * Always set by the manager-scoped `_action` route; absent everywhere
   * else.
   */
  relation?: {
    parent:       unknown
    parentId:     string
    relationship: string
  }
  /** When set, supplied user is stamped on `ctx.user`. Routes that
   *  already resolved the user (auth prelude) pass it through so handlers
   *  see the same user the route gated on. */
  user?:    unknown
}

export interface DispatchActionSuccess {
  ok:           true
  redirect?:    string
  /** Notifications the handler emitted via the return shape `{ notify }`.
   * Forwarded by the route layer either inline (JSON dispatch) or as
   * a flash payload through the redirect (HTML dispatch). */
  notifications?: NotificationMeta[]
  /** File-download envelope the handler emitted via `{ download }`.
   * The route layer writes `Content-Disposition: attachment` + the
   * payload body and ignores `redirect` when this is set. */
  download?: DownloadEnvelope
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
  if (input.relation !== undefined) ctx.relation = input.relation
  if (input.user     !== undefined) ctx.user     = input.user

  if (input.ids.length === 1) {
    const id = input.ids[0]!
    ctx.record = resolveRecord ? await resolveRecord(id) : { id }
  } else if (input.ids.length > 1) {
    ctx.records = resolveRecord
      ? await Promise.all(input.ids.map(id => Promise.resolve(resolveRecord(id))))
      : input.ids.map(id => ({ id }))
  }

  // Row-scoped dispatch (Repeater / Builder `extraItemActions`). Coerce
  // the form body once via the form's own schema, navigate to the row
  // identified by `rowPath`, and stamp `ctx.row`. The handler still sees
  // `ctx.values` (top-level fields) and `ctx.record` (parent record);
  // `ctx.row.values` carries the row's fields specifically.
  if (input.rowPath && input.rowField && input.formSchema) {
    const parsed = parseRowPath(input.rowPath, input.rowField.name)
    if (parsed) {
      const coerced  = coerceFormValues(input.formSchema, input.values)
      const arr      = coerced[input.rowField.name]
      const rowEntry = Array.isArray(arr) ? (arr as Array<unknown>)[parsed.index] : undefined
      const rowData  = extractRowData(rowEntry, input.rowField)
      const rowId    = rowData['__id']
      ctx.row = {
        index:     parsed.index,
        id:        typeof rowId === 'string' ? rowId : `${input.rowField.name}-${parsed.index}`,
        values:    rowData,
        fieldName: input.rowField.name,
      }
      if (input.rowField instanceof BuilderField && rowEntry && typeof rowEntry === 'object') {
        const t = (rowEntry as { type?: unknown }).type
        if (typeof t === 'string') ctx.row.blockType = t
      }
    }
  }

  // Form-modal action — validate the submitted values against the action's
  // schema, then coerce strings into runtime types (booleans/numbers/Dates)
  // before invoking the handler. Action without `.schema()` skips both
  // (degenerate confirm-only / no-modal cases).
  if (action.hasModal()) {
    const schema = action.getSchema()
    if (schema.length > 0) {
      const errors = await validateSchema(schema, input.values, ctx.record)
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
      if (isDownloadEnvelope(result.download)) success.download = result.download
    }
    return success
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : 'Action failed',
    }
  }
}

/**
 * Parse `_rowPath` body field into `{ index }`. v1 supports only
 * top-level array-row fields (`<fieldName>.<index>`); deeper paths
 * (nested Repeaters) are rejected — return null.
 *
 * `expectedField` guards against client-supplied paths pointing at the
 * wrong field for the named action. Returns null on mismatch so the
 * dispatcher silently treats the request as non-row-scoped (the action
 * still runs at page level).
 */
function parseRowPath(
  raw:           string,
  expectedField: string,
): { index: number } | null {
  const parts = raw.split('.')
  if (parts.length !== 2) return null
  if (parts[0] !== expectedField) return null
  const index = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isInteger(index) || index < 0) return null
  return { index }
}

/**
 * Pull the row's data envelope from a coerced row entry. RepeaterField
 * stores rows as flat `{ [field]: value, __id? }` objects; BuilderField
 * stores them as `{ __id, type, data: {…} }`. The handler always sees
 * a flat row-fields map, so we unwrap Builder's `.data`.
 */
function extractRowData(
  entry:    unknown,
  field:    RepeaterField | BuilderField,
): Record<string, unknown> {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {}
  if (field instanceof BuilderField) {
    const data = (entry as { data?: unknown }).data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ...(data as Record<string, unknown>) }
    }
    return {}
  }
  const out = { ...(entry as Record<string, unknown>) }
  return out
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

/** Structural shape check for the `{ download }` envelope. Defends the
 * route layer from a handler that returns a partial / wrong-typed
 * download object. */
function isDownloadEnvelope(value: unknown): value is DownloadEnvelope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.filename === 'string'
    && typeof v.contentType === 'string'
    && typeof v.body === 'string'
}
