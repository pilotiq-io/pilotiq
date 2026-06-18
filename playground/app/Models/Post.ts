import { Model } from '@rudderjs/orm'
import { User } from './User.js'
import { Category } from './Category.js'
import { Comment } from './Comment.js'

export class Post extends Model.for<'post'>() {
  static override table = 'post'
  static override keyType = 'ulid' as const
  /** Opt the rudder side into soft-delete behavior. The matching
   *  `PostResource.softDeletes = true` opts pilotiq's TrashedFilter /
   *  Restore / ForceDelete UX in — both flags are required. */
  static override softDeletes = true

  // Write-side casts keep better-sqlite3 happy: the form pipeline
  // coerces `publishedAt` to a Date and `content` to the parsed Tiptap
  // object, and the native driver can only bind primitives — the casts
  // serialize on write (ISO string / JSON string) and revive on read.
  static override casts = {
    publishedAt: 'datetime' as const,
    content:     'json' as const,
    image:       'json' as const,   // FileUpload.metaFields() value — { url, alt }
    gallery:     'json' as const,
    coverMedia:  'json' as const,   // MediaField value (MediaRef[] — @pilotiq/media)
  }

  static override relations = {
    // M2M — a post can have many authors. Synced from the form via
    // `SelectField.multiple().relationship('authors')`.
    authors: {
      type:       'belongsToMany' as const,
      model:      () => User,
      pivotTable: 'post_author',
      // foreignPivotKey / relatedPivotKey default to `postId` / `userId`.
    },
    categories: {
      type:       'belongsToMany' as const,
      model:      () => Category,
      pivotTable: 'category_post',
    },
    // Self-referencing M2M — both pivot columns point at `post`, so the
    // default `${camelCase(class)}Id` naming would collide; declare the
    // keys explicitly.
    relatedPosts: {
      type:            'belongsToMany' as const,
      model:           () => Post,
      pivotTable:      'post_related',
      foreignPivotKey: 'postId',
      relatedPivotKey: 'relatedId',
    },
    comments: { type: 'hasMany' as const, model: () => Comment, foreignKey: 'postId' },
  }
}
