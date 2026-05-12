/**
 * Thin localStorage wrappers shared by every persistable surface
 * (collapsible sections, dismissible alerts, wizard step, hidden table
 * columns, group fold state, filter strip toggle, Repeater / Builder
 * row collapse + accordion).
 *
 * Every helper silently no-ops on SSR / private mode / quota — callers
 * already treat all three the same way.
 */

export function readStoredString(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) }
  catch { return null }
}

export function writeStoredString(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* quota / blocked */ }
}

export function removeStoredString(key: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(key) } catch { /* */ }
}

/**
 * Boolean flag using `'1'` / `'0'` encoding. Returns `defaultValue`
 * when the key is unset, SSR, or storage is blocked.
 */
export function readStoredFlag(key: string, defaultValue: boolean): boolean {
  const raw = readStoredString(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return defaultValue
}

export function writeStoredFlag(key: string, value: boolean): void {
  writeStoredString(key, value ? '1' : '0')
}
