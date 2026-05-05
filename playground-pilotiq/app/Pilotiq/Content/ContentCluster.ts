import { Cluster } from '@pilotiq/pilotiq'

/**
 * Demo cluster grouping the public-facing "content" types (Posts, Tags,
 * Videos, Comments) under a `/new-admin/content/...` URL prefix and a
 * single sidebar entry. Articles + Users stay top-level to keep the
 * mixed (clustered + non-clustered) demo case in the playground.
 */
export class ContentCluster extends Cluster {
  static override label = 'Content'
  static override slug  = 'content'
  static override icon  = 'folder'
}
