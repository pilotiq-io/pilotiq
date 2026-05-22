import { useSyncExternalStore } from 'react'
import type { CodeEditorTheme } from '../CodeEditorField.js'

/**
 * Shared dark-mode detector for both `CodeMirrorEditor` and
 * `CollabCodeMirrorEditor`.
 *
 * One MutationObserver + one matchMedia listener for the whole page, fanned
 * out to all `useThemeIsDark` subscribers via `useSyncExternalStore`. The
 * previous setup in `CodeMirrorEditor` installed an observer + listener pair
 * per editor instance, which scaled linearly with editor count — a dense
 * Repeater of code-input rows installed N pairs and ran N updates on every
 * theme toggle. Centralizing keeps the work O(1) regardless of editor count.
 *
 * `keyword` is the user's explicit choice (`'light' | 'dark' | 'auto'`).
 * Explicit values short-circuit the listener (`'light'` always returns
 * false, `'dark'` always true). Only `'auto'` consults the global subscription.
 */

function resolveAutoDark(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return true
  if (typeof window   !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return true
  return false
}

const autoDarkListeners = new Set<() => void>()
let autoDarkSubscribed = false
let cachedAutoDark = false

function notifyAutoDarkListeners(): void {
  const next = resolveAutoDark()
  if (next === cachedAutoDark) return
  cachedAutoDark = next
  autoDarkListeners.forEach((l) => l())
}

function ensureAutoDarkSubscribed(): void {
  if (autoDarkSubscribed) return
  if (typeof window === 'undefined') return
  autoDarkSubscribed = true
  cachedAutoDark = resolveAutoDark()
  const observer = new MutationObserver(notifyAutoDarkListeners)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', notifyAutoDarkListeners)
}

function subscribeAutoDark(listener: () => void): () => void {
  ensureAutoDarkSubscribed()
  autoDarkListeners.add(listener)
  return () => { autoDarkListeners.delete(listener) }
}

function getAutoDarkSnapshot(): boolean {
  return cachedAutoDark
}

function getAutoDarkServerSnapshot(): boolean {
  return false
}

export function useThemeIsDark(keyword: CodeEditorTheme): boolean {
  const isAutoDark = useSyncExternalStore(subscribeAutoDark, getAutoDarkSnapshot, getAutoDarkServerSnapshot)
  if (keyword === 'light') return false
  if (keyword === 'dark')  return true
  return isAutoDark
}
