import { Model } from '@rudderjs/orm'

export class Article extends Model {
  static override table = 'article'

  id!:        string
  title!:     string
  slug!:      string | null
  status!:    string
  createdAt!: Date
  updatedAt!: Date
}
