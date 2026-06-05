import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('post', (t) => {
      t.string('id').primary()
      t.string('title')
      t.text('body').nullable()
      t.string('status').default('draft')
      t.string('authorId')
      t.dateTime('publishedAt').nullable()
      // Plan #13 — soft-delete column (Post.softDeletes = true on the
      // model, PostResource.softDeletes = true on the pilotiq side).
      t.softDeletes()
      // Reorderable rows demo — PostResource.table().reorderable('sort')
      // re-stamps this column 1..n in array order.
      t.integer('sort').default(0)
      t.timestamps()
      t.foreign('authorId').references('id').on('user').cascadeOnDelete()
    })
  }

  async down() {
    await Schema.dropIfExists('post')
  }
}
