import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.table('post', (t) => {
      t.json('gallery').nullable()                 // multi-image gallery (FileUpload.multiple)
    })
  }

  async down() {
    await Schema.table('post', (t) => {
      t.dropColumn('gallery')
    })
  }
}
