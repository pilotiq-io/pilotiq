import type { ComponentType } from 'react'

/**
 * Render-time component registry for `SlotComponent` schema elements.
 * Mirrors the widget / entry registry pattern: users register components
 * by name in their app's `bootstrap/providers.ts` (or via a plugin's
 * `register(panel)` hook), the `SlotComponent` ships the registered name
 * on the wire (`{ component: 'BookmarkButton' }`), and the renderer
 * looks up the actual component at render through `getSlotComponent()`.
 *
 * Why a runtime registry rather than the build-time `_components.ts`
 * manifest the icon system uses: slot components typically live in plugin
 * packages or app-level bootstrap files, not on Resource / Global / Page
 * top-level statics, so the existing manifest walker doesn't see them. A
 * runtime register-by-name keeps the wire compact and mirrors the
 * `registerWidgetComponents / registerEntryComponents` precedent.
 *
 * @example
 *   // bootstrap/providers.ts
 *   import { registerSlotComponents } from '@pilotiq/pilotiq/slot-components'
 *   import { BookmarkButton } from '#components/BookmarkButton.js'
 *   registerSlotComponents({ BookmarkButton })
 *
 *   // Then a render-hook contribution (or any schema slot) can reference it:
 *   panel.renderHook(
 *     'panels::resource.pages.edit-record.header.actions.before',
 *     () => [SlotComponent.make('BookmarkButton').props({ … })],
 *   )
 */

/**
 * Props handed to every registered slot component. The schema-side
 * `SlotComponent.props({...})` setter ships through verbatim — pack
 * everything the component needs into that bag (basePath, recordId,
 * pre-resolved agent metas, etc).
 */
export type SlotComponentProps = Record<string, unknown>
export type SlotComponent      = ComponentType<SlotComponentProps>

const registry: Record<string, SlotComponent> = {}

export function registerSlotComponents(map: Record<string, SlotComponent>): void {
  for (const key of Object.keys(map)) {
    const c = map[key]
    if (c) registry[key] = c
  }
}

export function getSlotComponent(name: string): SlotComponent | undefined {
  return registry[name]
}

/** Test-only: clear the registry. Not exported from the public entry. */
export function _resetSlotComponentRegistryForTests(): void {
  for (const key of Object.keys(registry)) delete registry[key]
}
