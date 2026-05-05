import type { ResourceClass } from './Resource.js'
import type { GlobalClass } from './Global.js'
import type { ClusterClass } from './Cluster.js'
import type { Page } from './Page.js'

// Lives in its own module so Resource / Global / Page can import the
// helpers without dragging in Cluster.ts and tripping a cycle.

interface ClusterableChild {
  cluster?: ClusterClass
  getSlug(): string
}

function childBasePath(panelBase: string, child: ClusterableChild): string {
  const slug = child.getSlug()
  return child.cluster
    ? `${panelBase}/${child.cluster.getSlug()}/${slug}`
    : `${panelBase}/${slug}`
}

export function resourceBasePath(panelBase: string, R: ResourceClass): string {
  return childBasePath(panelBase, R)
}

export function globalBasePath(panelBase: string, G: GlobalClass): string {
  return childBasePath(panelBase, G)
}

export function pageBasePath(panelBase: string, P: typeof Page): string {
  return childBasePath(panelBase, P)
}

export function clusterBasePath(panelBase: string, C: ClusterClass): string {
  return `${panelBase}/${C.getSlug()}`
}
