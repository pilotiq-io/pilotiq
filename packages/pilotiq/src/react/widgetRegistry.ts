import type { ComponentType } from 'react'
import type { ElementMeta } from '../schema/Element.js'

/**
 * Plan #15 Phase C — runtime registry for widget renderers (Chart,
 * future Table-widget slim mode, etc.). Mirrors the field-renderer
 * registry pattern so adapter packages can plug their renderer in
 * without forcing pilotiq core to import their dependencies.
 *
 * Built-in widget types (`stats`, `view`) are dispatched directly inside
 * SchemaRenderer's switch. Adapter-package widgets (`chart` from
 * `@pilotiq/recharts`) register here and SchemaRenderer's default case
 * consults the registry before falling through.
 *
 * Call once at app boot, client-side:
 *
 *   import { registerChartRenderer } from '@pilotiq/recharts'
 *   registerChartRenderer()
 *
 * Without the boot call, SchemaRenderer surfaces a clear "package not
 * registered" error at the call site rather than silently rendering
 * nothing.
 */

export interface WidgetRendererProps {
  meta: ElementMeta
}

const renderers = new Map<string, ComponentType<WidgetRendererProps>>()

/** Register a renderer for a widget element `type`. Re-registering
 *  overwrites, which is convenient for HMR. */
export function registerWidgetRenderer(
  type: string,
  Component: ComponentType<WidgetRendererProps>,
): void {
  renderers.set(type, Component)
}

/** Look up a registered renderer; `undefined` for unregistered types. */
export function getWidgetRenderer(
  type: string,
): ComponentType<WidgetRendererProps> | undefined {
  return renderers.get(type)
}

/** Test-only — clear the registry. Not part of the public surface. */
export function _resetWidgetRendererRegistryForTests(): void {
  renderers.clear()
}
