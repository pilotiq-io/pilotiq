import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('post', (t) => {
      t.string('id').primary()
      t.string('title')
      t.string('slug').unique()
      t.string('status').default('draft')          // draft | published | archived
      t.dateTime('publishedAt').nullable()
      t.string('image').nullable()                 // cover image URL (FileUpload)
      t.json('content').nullable()                 // Tiptap document (rich text + blocks)
      t.string('metaTitle').nullable()             // SEO
      t.string('metaDescription').nullable()       // SEO
      t.softDeletes()
      t.timestamps()
    })

    // M2M pivots — written through the rudder `belongsToMany` accessor
    // (`post.authors().sync([...])` etc.), so they're pure data
    // containers with no model class.
    await Schema.create('post_author', (t) => {
      t.string('postId')
      t.string('userId')
      t.primary(['postId', 'userId'])
    })

    await Schema.create('category_post', (t) => {
      t.string('categoryId')
      t.string('postId')
      t.primary(['categoryId', 'postId'])
    })

    // Self-referencing M2M — "related posts". Both columns point at
    // `post`, so the relation declares explicit pivot keys
    // (`foreignPivotKey: 'postId'`, `relatedPivotKey: 'relatedId'`).
    await Schema.create('post_related', (t) => {
      t.string('postId')
      t.string('relatedId')
      t.primary(['postId', 'relatedId'])
    })
  }

  async down() {
    await Schema.dropIfExists('post_related')
    await Schema.dropIfExists('category_post')
    await Schema.dropIfExists('post_author')
    await Schema.dropIfExists('post')
  }
}
