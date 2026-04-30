import type { ComponentType } from 'react'

export type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false'; 'aria-label'?: string }>

export type IconMap = Record<string, IconType>

// Module-level singleton. Populated by `registerIcons()`. Reads via
// `getIcon()` / `useIcon()`. Same-module-instance assumption: this is
// runtime-side state, registered from user code at app boot.
const registry: IconMap = {}

/**
 * Register icons by canonical name. User-supplied registry — pilotiq
 * looks up `Action.icon('send')`, `Column.icon('check')`, etc. against
 * this map.
 *
 * Repeated calls merge. Later calls override earlier entries for the
 * same key, so users can spread a baseline (`registerIcons(lucideIcons)`)
 * and then patch individual entries.
 *
 * @example
 *   import { registerIcons } from '@pilotiq/pilotiq/icons'
 *   import { Send, Trash } from 'lucide-react'
 *   registerIcons({ send: Send, trash: Trash })
 */
export function registerIcons(map: IconMap): void {
  for (const key of Object.keys(map)) {
    const v = map[key]
    if (v) registry[key] = v
  }
}

/** Look up an icon by canonical name. Returns `undefined` for unknown keys. */
export function getIcon(name: string): IconType | undefined {
  return registry[name]
}

/** Test-only: clear the registry. Not exported from the public entry. */
export function _resetIconRegistryForTests(): void {
  for (const key of Object.keys(registry)) delete registry[key]
}
