import { Model } from '@rudderjs/orm'
import { Tag } from './Tag.js'

// Columns come from the generated schema registry (`Model.for<'article'>`)
// — `rudder migrate` / `rudder schema:types` keeps them in sync with the
// migrated schema, so no hand-declared fields.
export class Article extends Model.for<'article'>() {
  static override table = 'article'
  static override keyType = 'ulid' as const
  // Folded into the generated registry by `rudder schema:types`
  // (`featured: boolean` instead of the raw 0/1 INTEGER).
  static override casts = { featured: 'boolean' as const }

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
}
