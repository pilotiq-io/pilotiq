import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('video', (t) => {
      t.string('id').primary()
      t.string('title')
      t.string('url')
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('video')
  }
}
