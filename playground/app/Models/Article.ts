import { Model } from '@rudderjs/orm'
import { Tag } from './Tag.js'

// Columns come from the generated schema registry (`Model.for<'article'>`)
// — `rudder migrate` / `rudder schema:types` keeps them in sync with the
// migrated schema, so no hand-declared fields.
export class Article extends Model.for<'article'>() {
  static override table = 'article'
  static override keyType = 'ulid' as const
  // `featured` stays the raw 0/1 INTEGER (`featured: number` in the
  // registry). A `casts = { featured: 'boolean' }` refinement would be
  // nicer, but schema:types only folds casts from REGISTERED models and
  // registration happens on first query — never during a CLI boot. Filed
  // upstream; revisit once the generator sees import-time casts.

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
