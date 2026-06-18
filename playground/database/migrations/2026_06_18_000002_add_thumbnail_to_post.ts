import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.table('post', (t) => {
      t.string('thumbnail').nullable()      // bare URL — metaColumn split demo
      t.json('thumbnail_meta').nullable()   // companion meta object
    })
  }

  async down() {
    await Schema.table('post', (t) => {
      t.dropColumn('thumbnail')
      t.dropColumn('thumbnail_meta')
    })
  }
}
