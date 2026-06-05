import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.create('user', (t) => {
      t.string('id').primary()              // app-generated (Model keyType 'ulid')
      t.string('name')
      t.string('email').unique()
      t.string('password').nullable()
      t.boolean('emailVerified').default(false)
      t.string('image').nullable()
      t.string('role').default('user')
      t.string('rememberToken').nullable()
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('user')
  }
}
