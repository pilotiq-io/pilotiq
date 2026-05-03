import { registerWidgetRenderer } from '@pilotiq/pilotiq/react'
import { ChartRenderer } from './react/ChartRenderer.js'

/**
 * Register the Recharts-based renderer for `Chart` widgets. Call once
 * in your app's client-side entry point:
 *
 * ```ts
 * import { registerChartRenderer } from '@pilotiq/recharts'
 * registerChartRenderer()
 * ```
 *
 * Without this call, `Chart` widgets shipped in your panel's schema
 * paint a clear "renderer not registered" error pointing at the install
 * command, rather than silently rendering nothing.
 */
export function registerChartRenderer(): void {
  registerWidgetRenderer('chart', ChartRenderer)
}
