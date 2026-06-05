import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'

export class Comment extends Model.for<'comment'>() {
  static override table = 'comment'
  static override keyType = 'ulid' as const

  static override relations = {
    post: { type: 'belongsTo' as const, model: () => Post, foreignKey: 'postId' },
  }
}
