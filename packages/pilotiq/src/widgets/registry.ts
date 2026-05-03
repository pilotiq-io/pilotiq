import type { ComponentType } from 'react'

/**
 * Render-time component registry for `View` widgets. Mirrors the icon
 * registry pattern: users register components by name in their app's
 * `bootstrap/providers.ts`, the `View` element ships the registered name
 * on the wire (`{ component: 'CalendarHeatmap' }`), and the renderer
 * looks up the actual component at render through `getWidgetComponent()`.
 *
 * Why a runtime registry rather than the build-time `_components.ts`
 * manifest the icon system uses: View widgets live inside `Page.schema()`,
 * not on Resource/Global/Page top-level statics, so the existing manifest
 * walker (`cfg.resources / globals / pages → _all[c.name] = c`) doesn't
 * see them. A runtime register-by-name keeps the wire compact and
 * mirrors the `registerCodeEditor / registerChartRenderer` precedent.
 *
 * @example
 *   // bootstrap/providers.ts
 *   import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
 *   import { CalendarHeatmap } from '#widgets/CalendarHeatmap.js'
 *   registerWidgetComponents({ CalendarHeatmap })
 *
 *   // Page.schema()
 *   View.make('contributions').component('CalendarHeatmap').getData(...)
 */

export type WidgetComponent = ComponentType<{ data?: unknown }>

const registry: Record<string, WidgetComponent> = {}

export function registerWidgetComponents(map: Record<string, WidgetComponent>): void {
  for (const key of Object.keys(map)) {
    const c = map[key]
    if (c) registry[key] = c
  }
}

export function getWidgetComponent(name: string): WidgetComponent | undefined {
  return registry[name]
}

/** Test-only: clear the registry. Not exported from the public entry. */
export function _resetWidgetRegistryForTests(): void {
  for (const key of Object.keys(registry)) delete registry[key]
}
