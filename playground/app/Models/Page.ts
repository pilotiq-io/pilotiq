import { Model } from '@rudderjs/orm'

export class Page extends Model.for<'page'>() {
  static override table = 'page'
  static override keyType = 'ulid' as const
  // `boolean` folds into the generated registry (`published: boolean`
  // instead of the raw 0/1 INTEGER); `json` serializes the Tiptap
  // document on write (better-sqlite3 can't bind objects) and revives
  // it on read.
  static override casts = {
    published: 'boolean' as const,
    content:   'json' as const,
  }
}
