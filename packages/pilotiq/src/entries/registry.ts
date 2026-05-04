import type { ComponentType } from 'react'

/**
 * Render-time component registry for `ComponentEntry` infolist entries.
 * Mirrors the widget registry pattern (`@pilotiq/pilotiq/widgets`): users
 * register components by name in their app's `bootstrap/providers.ts`,
 * the `ComponentEntry` ships the registered name on the wire
 * (`{ component: 'CoordinatesMap' }`), and the renderer looks up the
 * actual component at render through `getEntryComponent()`.
 *
 * Why a runtime registry rather than the build-time `_components.ts`
 * manifest the icon system uses: entries live inside `Resource.detail()`,
 * not as Resource/Global/Page top-level statics, so the existing
 * manifest walker (`cfg.resources / globals / pages → _all[c.name] = c`)
 * doesn't see them. A runtime register-by-name keeps the wire compact
 * and mirrors the `registerWidgetComponents / registerCodeEditor` precedent.
 *
 * @example
 *   // bootstrap/providers.ts
 *   import { registerEntryComponents } from '@pilotiq/pilotiq/entries'
 *   import { CoordinatesMap } from '#entries/CoordinatesMap.js'
 *   registerEntryComponents({ CoordinatesMap })
 *
 *   // Resource.detail()
 *   ComponentEntry.make('location').component('CoordinatesMap')
 */

/**
 * Props handed to every registered entry component. v1 ships only the
 * resolved state value — pack additional record fields into the value
 * via the entry's `.state(r => composedObject)` accessor when the
 * component needs more than one field. Mirrors the wire-economy posture
 * of `View` widgets (which receive `{ data }` only).
 */
export type EntryComponentProps = { value: unknown }
export type EntryComponent      = ComponentType<EntryComponentProps>

const registry: Record<string, EntryComponent> = {}

export function registerEntryComponents(map: Record<string, EntryComponent>): void {
  for (const key of Object.keys(map)) {
    const c = map[key]
    if (c) registry[key] = c
  }
}

export function getEntryComponent(name: string): EntryComponent | undefined {
  return registry[name]
}

/** Test-only: clear the registry. Not exported from the public entry. */
export function _resetEntryRegistryForTests(): void {
  for (const key of Object.keys(registry)) delete registry[key]
}
