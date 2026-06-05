import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    // Polymorphic — Comment attaches to Post OR Video via the camelCase
    // `commentableId` + `commentableType` columns (rudder ORM divergence
    // from Laravel snake_case). String ids, so the columns are hand-rolled
    // rather than t.morphs() (which emits a bigInteger id).
    await Schema.create('comment', (t) => {
      t.string('id').primary()
      t.text('body')
      t.string('commentableId')
      t.string('commentableType')
      t.timestamps()
      t.index(['commentableId', 'commentableType'])
    })

    // Phase B nested-resources demo — Comment owns Reply rows (hasMany),
    // mounted at posts/:postId/comments/:commentId/replies.
    await Schema.create('reply', (t) => {
      t.string('id').primary()
      t.string('commentId')
      t.text('body')
      t.timestamps()
      t.index('commentId')
    })
  }

  async down() {
    await Schema.dropIfExists('reply')
    await Schema.dropIfExists('comment')
  }
}
