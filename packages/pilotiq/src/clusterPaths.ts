import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { ClusterClass } from './Cluster.js'
import type { Page } from './Page.js'

/**
 * Cluster-aware URL builders. A child whose `static cluster` is set gains
 * the cluster's slug as a prefix segment; otherwise behaves identically to
 * the pre-cluster `${panelBase}/${child.getSlug()}` pattern.
 *
 * These live in their own module so `routes.ts` and `pageData.ts` can
 * import them without dragging in `Cluster.ts` directly through one of
 * the larger surfaces (and to avoid a Resource / Global → Cluster cycle).
 */

export function resourceBasePath(panelBase: string, R: ResourceClass): string {
  if (R.cluster) return `${panelBase}/${R.cluster.getSlug()}/${R.getSlug()}`
  return `${panelBase}/${R.getSlug()}`
}

export function globalBasePath(panelBase: string, G: GlobalClass): string {
  if (G.cluster) return `${panelBase}/${G.cluster.getSlug()}/${G.getSlug()}`
  return `${panelBase}/${G.getSlug()}`
}

export function pageBasePath(panelBase: string, P: typeof Page): string {
  if (P.cluster) return `${panelBase}/${P.cluster.getSlug()}/${P.getSlug()}`
  return `${panelBase}/${P.getSlug()}`
}

export function clusterBasePath(panelBase: string, C: ClusterClass): string {
  return `${panelBase}/${C.getSlug()}`
}
