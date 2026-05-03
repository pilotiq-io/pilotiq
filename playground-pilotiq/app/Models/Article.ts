import { Model } from '@rudderjs/orm'
import { Tag } from './Tag.js'

export class Article extends Model {
  static override table = 'article'

  // M2M demo — explicit pivot table named `article_tag` with
  // `articleId` / `tagId` columns. The rudder `belongsToMany` accessor
  // writes to the pivot directly, so the implicit `_ArticleToTag`
  // shape Prisma generates for `@relation` arrays is not used.
  static override relations = {
    tags: {
      type:        'belongsToMany' as const,
      model:       () => Tag,
      pivotTable:  'article_tag',
      // `foreignPivotKey` / `relatedPivotKey` default to
      // `${camelCase(parentClassName)}Id` / `${camelCase(relatedClassName)}Id`
      // — i.e. `articleId` / `tagId`, which matches the schema above.
    },
  }

  id!:        string
  title!:     string
  slug!:      string | null
  status!:    string
  createdAt!: Date
  updatedAt!: Date
}
