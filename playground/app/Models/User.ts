import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'

export class User extends Model.for<'user'>() {
  static override table  = 'user'
  static override keyType = 'ulid' as const
  static override hidden = ['password', 'rememberToken']

  static override relations = {
    posts: { type: 'hasMany' as const, model: () => Post, foreignKey: 'authorId' },
  }
}
