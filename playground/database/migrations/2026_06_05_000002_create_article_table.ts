import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('article', (t) => {
      t.string('id').primary()
      t.string('title').default('')
      t.string('slug').nullable().unique()
      t.text('excerpt').nullable()
      t.string('coverImage').nullable()
      t.text('tags').default('[]')          // JSON-encoded string[] (TagsInput demo)
      t.string('status').default('draft')
      t.string('draftStatus').default('draft')
      t.boolean('featured').default(false)
      t.dateTime('publishedAt').nullable()
      t.string('accentColor').nullable()
      t.string('metaTitle').nullable()
      t.string('metaDescription').nullable()
      t.json('content').nullable()          // rich-text editor state
      t.json('body').nullable()
      t.text('metadata').nullable()         // JSON blob (KeyValueEntry demo)
      t.softDeletes()
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('article')
  }
}
