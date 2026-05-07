import { Model } from '@rudderjs/orm'
import { Post } from './Post.js'

export class User extends Model {
  static override table  = 'user'
  static override hidden = ['password', 'rememberToken']

  static override relations = {
    posts: { type: 'hasMany' as const, model: () => Post, foreignKey: 'authorId' },
  }

  id!:        string
  name!:      string
  email!:     string
  role!:      string
  createdAt!: Date
  updatedAt!: Date
}
