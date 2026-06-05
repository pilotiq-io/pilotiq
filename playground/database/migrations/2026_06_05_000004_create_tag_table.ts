import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('tag', (t) => {
      t.string('id').primary()
      t.string('name').unique()
      t.string('slug').unique()
      t.string('color').nullable()
      t.timestamps()
    })

    // Explicit M2M pivot — Article <-> Tag. rudder ORM's `belongsToMany`
    // accessor writes pivot rows directly (insertMany / deleteAll), so
    // the pivot is a pure data container with no model class.
    await Schema.create('article_tag', (t) => {
      t.string('articleId')
      t.string('tagId')
      t.primary(['articleId', 'tagId'])
    })

    // Polymorphic M2M pivot — one shared `taggable` table distinguished
    // by `taggableType`. Post.tags() / Video.tags() (morphToMany) and
    // Tag.posts() / Tag.videos() (morphedByMany) all flow through it.
    await Schema.create('taggable', (t) => {
      t.string('tagId')
      t.string('taggableId')
      t.string('taggableType')
      t.primary(['tagId', 'taggableId', 'taggableType'])
      t.index(['taggableId', 'taggableType'])
    })
  }

  async down() {
    await Schema.dropIfExists('taggable')
    await Schema.dropIfExists('article_tag')
    await Schema.dropIfExists('tag')
  }
}
