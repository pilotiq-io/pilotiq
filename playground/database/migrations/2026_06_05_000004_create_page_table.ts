import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('page', (t) => {
      t.string('id').primary()
      t.string('title')
      t.string('slug').unique()
      t.json('content').nullable()                 // Tiptap document
      t.boolean('published').default(false)
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('page')
  }
}
