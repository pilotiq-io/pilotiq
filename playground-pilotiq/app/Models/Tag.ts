import { Model } from '@rudderjs/orm'

/**
 * M2M demo target — paired with Article via an explicit `article_tag`
 * pivot. The relation lives on the Article side (`Article.relations.tags`);
 * Tag itself doesn't need to declare a back-relation for pilotiq's
 * RelationManager to work, but downstream code that wants
 * `tag.related('articles')` would add one.
 */
export class Tag extends Model {
  static override table = 'tag'

  id!:        string
  name!:      string
  slug!:      string
  color!:     string | null
  createdAt!: Date
  updatedAt!: Date
}
