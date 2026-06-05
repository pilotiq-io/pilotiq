import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'

export class Category extends Model.for<'category'>() {
  static override table = 'category'
  static override keyType = 'ulid' as const

  static override relations = {
    posts: {
      type:       'belongsToMany' as const,
      model:      () => Post,
      pivotTable: 'category_post',
    },
  }
}
