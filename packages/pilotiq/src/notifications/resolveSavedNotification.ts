/**
 * Resolve the saved-notification spec on a `Form` into a concrete
 * `NotificationMeta`, or `null` when notifications are explicitly
 * disabled. Used by `dispatchFormSubmit` to attach the success toast to
 * its result.
 *
 * Resolution order:
 *   1. If the form has `disableSavedNotification()` → null.
 *   2. Mode-specific spec (`createdNotification` for create) wins over
 *      generic `savedNotification` when set.
 *   3. `null` spec returns null (explicitly suppress the toast for that
 *      mode while keeping the generic fallback for the other mode).
 *   4. String spec → success toast with that title.
 *   5. Function spec → invoked with `(record, ctx)` and re-resolved.
 *   6. `Notification` builder or `NotificationMeta` → passes through.
 */
import { Notification, type NotificationMeta } from './Notification.js'
import type { Form, FormContext, SavedNotificationHandler } from '../elements/Form.js'

export type SavedNotificationMode = 'create' | 'update'

export function resolveSavedNotification<R>(
  form:    Form<R>,
  mode:    SavedNotificationMode,
  record:  R,
  ctx:     FormContext<R>,
): NotificationMeta | null {
  if (form.isSavedNotificationDisabled()) return null

  const modeSpec    = mode === 'create' ? form.getCreatedNotification() : undefined
  const sharedSpec  = form.getSavedNotification()
  const spec        = modeSpec !== undefined ? modeSpec : sharedSpec

  if (spec === undefined) return null
  return resolveSpec(spec, record, ctx)
}

function resolveSpec<R>(
  spec:   SavedNotificationHandler<R>,
  record: R,
  ctx:    FormContext<R>,
): NotificationMeta | null {
  if (spec === null) return null

  if (typeof spec === 'function') {
    const next = spec(record, ctx)
    return next === null ? null : resolveSpec(next as SavedNotificationHandler<R>, record, ctx)
  }

  if (typeof spec === 'string') {
    return Notification.make(spec).success().toMeta()
  }

  if (spec instanceof Notification) {
    return spec.toMeta()
  }

  return spec
}
