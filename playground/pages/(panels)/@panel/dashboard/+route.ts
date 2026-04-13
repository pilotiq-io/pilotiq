import type { RouteSync } from 'vike/types'
import { PanelRegistry } from '@pilotiq/panels'

// Match /{panel} exactly — only for registered panels.
export const route: RouteSync = (pageContext) => {
  const parts = pageContext.urlPathname.split('/').filter(Boolean)
  if (parts.length !== 1) return false

  const panelSegment = parts[0]!

  // Client-side: can't validate, let server resolve.
  if (!import.meta.env.SSR) return false

  const panel = PanelRegistry.all().find((p) => p.getPath() === `/${panelSegment}`)
  if (!panel) return false

  return { routeParams: { panel: panelSegment } }
}
