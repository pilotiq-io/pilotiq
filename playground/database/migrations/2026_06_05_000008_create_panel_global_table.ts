import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    // Pilotiq row store — theme-editor overrides (databaseThemeStorage)
    // and the AdminPanel site-settings Global persist here, keyed by slug.
    await Schema.create('panelGlobal', (t) => {
      t.string('slug').primary()
      t.text('data').default('{}')          // JSON stored as string
      t.dateTime('updatedAt').nullable()
    })
  }

  async down() {
    await Schema.dropIfExists('panelGlobal')
  }
}
