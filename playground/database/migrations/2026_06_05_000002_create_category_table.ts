import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('category', (t) => {
      t.string('id').primary()
      t.string('name').unique()
      t.string('slug').unique()
      t.text('description').nullable()
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('category')
  }
}
