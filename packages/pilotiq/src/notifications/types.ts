/**
 * Minimal notifiable contract used by `Notification.sendToDatabase()`
 * and the bell-icon endpoints. Mirrors the shape `@rudderjs/notification`
 * already publishes — `id` (string or number) is the only required
 * field. We coerce to string when writing the `notifiable_id` column so
 * mixed `number`/`string` ids stay consistent on disk.
 */
export interface Notifiable {
  readonly id:     string | number
  readonly email?: string
  readonly name?:  string
}
