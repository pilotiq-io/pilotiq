/**
 * Wall-clock ↔ instant conversion for the `YYYY-MM-DDTHH:mm` wire shape
 * shared by `DateTimeInput` / `DateField.withTime()`.
 *
 * The skew this module exists to prevent: the renderer used to format
 * the stored Date via `toISOString().slice(0, 16)` (UTC wall time)
 * while the coerce branch parsed the submitted naive string with
 * `new Date(str)` (LOCAL wall time per the ECMA date-time form), so a
 * save on any non-UTC server shifted the value by the server offset on
 * every round-trip. Both sides now run through here: **UTC on both
 * ends by default**, or the field's `timezone()` IANA zone when set.
 *
 * Pure `Intl` — no deps, client-safe (the renderer imports this too).
 */

/** Naive date-time — no zone designator. Seconds/millis tolerated on input. */
const NAIVE_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

/** Throws when `tz` is not a valid IANA timezone name. */
export function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw new Error(`Unknown IANA timezone '${tz}'`)
  }
}

/** Wall-clock parts of a UTC instant in `timeZone`, re-read as a UTC ms value. */
function wallClockAsUtc(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string): number =>
    Number(parts.find(p => p.type === type)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

/**
 * Format an instant as the `YYYY-MM-DDTHH:mm` wire string — wall-clock
 * UTC by default, or wall-clock in `timeZone` when given.
 */
export function formatWallClock(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toISOString().slice(0, 16)
  const ms  = wallClockAsUtc(date, timeZone)
  return new Date(ms).toISOString().slice(0, 16)
}

/**
 * Parse a submitted date/time string into a `Date` instant.
 *
 * - Naive `YYYY-MM-DDTHH:mm(:ss)` → wall-clock in `timeZone` (UTC when
 *   unset). Two-pass offset probe so instants near a DST transition
 *   resolve against the offset actually in force at that wall time.
 * - Everything else (`YYYY-MM-DD`, full ISO with `Z`/offset, …) →
 *   `new Date(value)` — date-only strings already parse as UTC
 *   midnight per spec, and zoned strings carry their own offset, so
 *   neither needs (or should get) timezone reinterpretation.
 */
export function parseDateTimeWire(value: string, timeZone?: string): Date {
  const m = NAIVE_DATE_TIME.exec(value)
  if (!m) return new Date(value)
  const [, y, mo, d, h, mi, s] = m
  const utcGuess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
  if (!timeZone) return new Date(utcGuess)
  const firstOffset = wallClockAsUtc(new Date(utcGuess), timeZone) - utcGuess
  const candidate   = utcGuess - firstOffset
  const offset      = wallClockAsUtc(new Date(candidate), timeZone) - candidate
  return new Date(utcGuess - offset)
}

/**
 * Normalize a render-time value (SSR `Date`, SPA-nav ISO string, or a
 * 422 re-render's raw naive body string) into the wire shape for
 * `DateTimeInput`. Naive strings are already wall-clock in the field's
 * zone — slice, never re-parse (`new Date(naive)` would reinterpret
 * them in the *server's* zone and skew validation-error re-renders).
 */
export function toDateTimeWire(value: unknown, timeZone?: string): string | undefined {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : formatWallClock(value, timeZone)
  }
  if (typeof value === 'string' && value) {
    if (NAIVE_DATE_TIME.test(value)) return value.slice(0, 16)
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? undefined : formatWallClock(parsed, timeZone)
  }
  return undefined
}
