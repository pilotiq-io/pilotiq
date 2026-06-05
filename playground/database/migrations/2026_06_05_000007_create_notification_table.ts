import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    // Database notifications — pilotiq's bell reads/writes this table
    // through the ORM adapter (notifications/database.ts duck-types the
    // query builder). Column names are snake_case to match the
    // @rudderjs/notification publisher convention; timestamp columns are
    // strings (ISO-8601) because the writers stamp them app-side.
    await Schema.create('notification', (t) => {
      t.string('id').primary()
      t.string('notifiable_id')
      t.string('notifiable_type')
      t.string('type')
      t.text('data')                        // JSON blob
      t.string('read_at').nullable()
      t.string('created_at')
      t.string('updated_at')
      t.index(['notifiable_type', 'notifiable_id'])
    })
  }

  async down() {
    await Schema.dropIfExists('notification')
  }
}
