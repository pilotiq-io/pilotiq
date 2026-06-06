import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.table('post', (t) => {
      t.string('metaImage').nullable()             // SEO / social share image URL (FileUpload)
    })
  }

  async down() {
    await Schema.table('post', (t) => {
      t.dropColumn('metaImage')
    })
  }
}
