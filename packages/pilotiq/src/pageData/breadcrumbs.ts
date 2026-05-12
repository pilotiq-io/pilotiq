import type { PilotiqConfig } from '../Pilotiq.js'
import type { ResourceClass } from '../Resource.js'
import type { GlobalClass } from '../Global.js'
import type { ClusterClass } from '../Cluster.js'
import type { Page } from '../Page.js'
import type { RelationManager } from '../RelationManager.js'
import { clusterBasePath, resourceBasePath } from '../clusterPaths.js'
import { Breadcrumbs, type BreadcrumbItem } from '../schema/Breadcrumbs.js'

// ─── Breadcrumb builders ────────────────────────────────────
//
// All builders return `Breadcrumbs | undefined` so the route handler
// can spread the result into `schemaData` without a guard. Each path
// roles to a known crumb chain (Home / cluster? / Resource / record? /
// relation? / nested? / verb?).

/** Depth-2 chain shape — each step identifies a path through the
 *  manager tree. Lives here because both the breadcrumb builders and
 *  the depth-2 relation manager builders consume it. */
export interface RelationChainStep {
  recordId:     string
  relationship: string
}


// `resourceBasePath`, etc., so a clustered resource resolves to
// `Home / Cluster / Resource / …` instead of skipping the cluster
// rung.

export function homeBreadcrumb(cfg: PilotiqConfig): BreadcrumbItem {
  return {
    label: cfg.branding?.title ?? cfg.name ?? 'Home',
    url:   cfg.path,
  }
}

export function clusterBreadcrumb(cfg: PilotiqConfig, child: { cluster?: ClusterClass }): BreadcrumbItem | undefined {
  if (!child.cluster) return undefined
  return {
    label: child.cluster.label,
    url:   clusterBasePath(cfg.path, child.cluster),
  }
}

export function buildBreadcrumbs(items: BreadcrumbItem[]): Breadcrumbs | undefined {
  // A single "Home" rung carries no information beyond the dashboard
  // link the layout already exposes — drop it. Every other length is
  // worth rendering.
  if (items.length < 2) return undefined
  return Breadcrumbs.make(items)
}

export function resourceListBreadcrumbs(cfg: PilotiqConfig, R: ResourceClass): Breadcrumbs | undefined {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, R)
  if (cluster) items.push(cluster)
  items.push({ label: R.getBreadcrumb() })
  return buildBreadcrumbs(items)
}

export function resourceCreateBreadcrumbs(cfg: PilotiqConfig, R: ResourceClass): Breadcrumbs | undefined {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, R)
  if (cluster) items.push(cluster)
  items.push({ label: R.getBreadcrumb(), url: resourceBasePath(cfg.path, R) })
  items.push({ label: 'Create' })
  return buildBreadcrumbs(items)
}

export function resourceViewBreadcrumbs(cfg: PilotiqConfig, R: ResourceClass, recordTitle: string): Breadcrumbs | undefined {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, R)
  if (cluster) items.push(cluster)
  items.push({ label: R.getBreadcrumb(), url: resourceBasePath(cfg.path, R) })
  items.push({ label: recordTitle })
  return buildBreadcrumbs(items)
}

export function resourceEditBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  recordId:    string,
  recordTitle: string,
): Breadcrumbs | undefined {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, R)
  if (cluster) items.push(cluster)
  const resourceBase = resourceBasePath(cfg.path, R)
  items.push({ label: R.getBreadcrumb(), url: resourceBase })
  // Link the record title to the View page when registered — falls
  // back to plain text so users who pruned ViewPage don't hit a 404.
  const hasView = R.resolvePages().view !== undefined
  items.push(hasView
    ? { label: recordTitle, url: `${resourceBase}/${recordId}` }
    : { label: recordTitle })
  items.push({ label: 'Edit' })
  return buildBreadcrumbs(items)
}

export function globalBreadcrumbs(cfg: PilotiqConfig, G: GlobalClass): Breadcrumbs | undefined {
  // Globals don't have a list page — `Home > <Global Label>` is the
  // shortest meaningful chain. Edit and View collapse to the same
  // breadcrumb (both render the singleton).
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, G)
  if (cluster) items.push(cluster)
  items.push({ label: G.label })
  return buildBreadcrumbs(items)
}

export function customPageBreadcrumbs(cfg: PilotiqConfig, P: typeof Page): Breadcrumbs | undefined {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, P)
  if (cluster) items.push(cluster)
  items.push({ label: P.getLabel() })
  return buildBreadcrumbs(items)
}

/** Common "Home / cluster? / Resource / parent record" prefix used by
 *  every relation-* / nested-relation-* breadcrumb. The parent record
 *  links to its View page when registered; the resource list is the
 *  fallback so users still have a back-link out of the relation chain. */
export function relationBreadcrumbPrefix(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  parentId:    string,
  parentTitle: string,
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [homeBreadcrumb(cfg)]
  const cluster = clusterBreadcrumb(cfg, R)
  if (cluster) items.push(cluster)
  const resourceBase = resourceBasePath(cfg.path, R)
  items.push({ label: R.getBreadcrumb(), url: resourceBase })
  const hasView = R.resolvePages().view !== undefined
  items.push(hasView
    ? { label: parentTitle, url: `${resourceBase}/${parentId}` }
    : { label: parentTitle })
  return items
}

export function relationListBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M:   typeof RelationManager,
  parentId:    string,
  parentTitle: string,
): Breadcrumbs | undefined {
  const items = relationBreadcrumbPrefix(cfg, R, parentId, parentTitle)
  items.push({ label: M.getLabel() })
  return buildBreadcrumbs(items)
}

export function relationCreateBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M:   typeof RelationManager,
  parentId:    string,
  parentTitle: string,
): Breadcrumbs | undefined {
  const items = relationBreadcrumbPrefix(cfg, R, parentId, parentTitle)
  const relList = `${resourceBasePath(cfg.path, R)}/${parentId}/${M.getRelationship()}`
  items.push({ label: M.getLabel(), url: relList })
  items.push({ label: 'Create' })
  return buildBreadcrumbs(items)
}

export function relationViewBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M:   typeof RelationManager,
  parentId:    string,
  parentTitle: string,
  childTitle:  string,
): Breadcrumbs | undefined {
  const items = relationBreadcrumbPrefix(cfg, R, parentId, parentTitle)
  const relList = `${resourceBasePath(cfg.path, R)}/${parentId}/${M.getRelationship()}`
  items.push({ label: M.getLabel(), url: relList })
  items.push({ label: childTitle })
  return buildBreadcrumbs(items)
}

export function relationEditBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M:   typeof RelationManager,
  parentId:    string,
  parentTitle: string,
  childId:     string,
  childTitle:  string,
): Breadcrumbs | undefined {
  const items = relationBreadcrumbPrefix(cfg, R, parentId, parentTitle)
  const relBase = `${resourceBasePath(cfg.path, R)}/${parentId}/${M.getRelationship()}`
  items.push({ label: M.getLabel(), url: relBase })
  // Phase A always mounts the relation-view page per (R, M), so the
  // child title can always link back to it.
  items.push({ label: childTitle, url: `${relBase}/${childId}` })
  items.push({ label: 'Edit' })
  return buildBreadcrumbs(items)
}

/** Phase B — depth-2 prefix shared by every nested-relation-* role.
 *  Returns "Home / cluster? / Resource / parent / M1 / child1". */
export function nestedRelationBreadcrumbPrefix(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M1:  typeof RelationManager,
  step0:       RelationChainStep,
  parentTitle: string,
  child1Id:    string,
  child1Title: string,
): BreadcrumbItem[] {
  const items = relationBreadcrumbPrefix(cfg, R, step0.recordId, parentTitle)
  const rel1Base = `${resourceBasePath(cfg.path, R)}/${step0.recordId}/${step0.relationship}`
  items.push({ label: M1.getLabel(), url: rel1Base })
  // Phase A relation-view always mounted, so child1 always links.
  items.push({ label: child1Title, url: `${rel1Base}/${child1Id}` })
  return items
}

export function nestedRelationListBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M1:  typeof RelationManager,
  M2:  typeof RelationManager,
  step0:       RelationChainStep,
  parentTitle: string,
  child1Id:    string,
  child1Title: string,
): Breadcrumbs | undefined {
  const items = nestedRelationBreadcrumbPrefix(cfg, R, M1, step0, parentTitle, child1Id, child1Title)
  items.push({ label: M2.getLabel() })
  return buildBreadcrumbs(items)
}

export function nestedRelationCreateBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M1:  typeof RelationManager,
  M2:  typeof RelationManager,
  step0:       RelationChainStep,
  parentTitle: string,
  child1Id:    string,
  child1Title: string,
): Breadcrumbs | undefined {
  const items = nestedRelationBreadcrumbPrefix(cfg, R, M1, step0, parentTitle, child1Id, child1Title)
  const rel2Base = `${resourceBasePath(cfg.path, R)}/${step0.recordId}/${step0.relationship}/${child1Id}/${M2.getRelationship()}`
  items.push({ label: M2.getLabel(), url: rel2Base })
  items.push({ label: 'Create' })
  return buildBreadcrumbs(items)
}

export function nestedRelationViewBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M1:  typeof RelationManager,
  M2:  typeof RelationManager,
  step0:       RelationChainStep,
  parentTitle: string,
  child1Id:    string,
  child1Title: string,
  child2Title: string,
): Breadcrumbs | undefined {
  const items = nestedRelationBreadcrumbPrefix(cfg, R, M1, step0, parentTitle, child1Id, child1Title)
  const rel2Base = `${resourceBasePath(cfg.path, R)}/${step0.recordId}/${step0.relationship}/${child1Id}/${M2.getRelationship()}`
  items.push({ label: M2.getLabel(), url: rel2Base })
  items.push({ label: child2Title })
  return buildBreadcrumbs(items)
}

export function nestedRelationEditBreadcrumbs(
  cfg: PilotiqConfig,
  R:   ResourceClass,
  M1:  typeof RelationManager,
  M2:  typeof RelationManager,
  step0:       RelationChainStep,
  parentTitle: string,
  child1Id:    string,
  child1Title: string,
  child2Id:    string,
  child2Title: string,
): Breadcrumbs | undefined {
  const items = nestedRelationBreadcrumbPrefix(cfg, R, M1, step0, parentTitle, child1Id, child1Title)
  const rel2Base = `${resourceBasePath(cfg.path, R)}/${step0.recordId}/${step0.relationship}/${child1Id}/${M2.getRelationship()}`
  items.push({ label: M2.getLabel(), url: rel2Base })
  items.push({ label: child2Title, url: `${rel2Base}/${child2Id}` })
  items.push({ label: 'Edit' })
  return buildBreadcrumbs(items)
}
