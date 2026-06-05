import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('comment', (t) => {
      t.string('id').primary()
      t.string('postId')
      t.string('authorName').nullable()
      t.text('body')
      t.timestamps()
      t.foreign('postId').references('id').on('post').cascadeOnDelete()
      t.index('postId')
    })
  }

  async down() {
    await Schema.dropIfExists('comment')
  }
}
