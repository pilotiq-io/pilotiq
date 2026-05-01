import { Model } from '@rudderjs/orm'
import { User } from './User.js'

export class Post extends Model {
  static override table = 'post'

  static override relations = {
    author: { type: 'belongsTo' as const, model: () => User, foreignKey: 'authorId' },
  }

  id!:          string
  title!:       string
  body!:        string | null
  status!:      string
  authorId!:    string
  publishedAt!: Date | null
  createdAt!:   Date
  updatedAt!:   Date
}
