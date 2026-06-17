import { Migration, Schema } from '@rudderjs/database'

export default class extends Migration {
  async up() {
    await Schema.table('post', (t) => {
      t.json('coverMedia').nullable()              // MediaField value (MediaRef[] — @pilotiq/media)
    })
  }

  async down() {
    await Schema.table('post', (t) => {
      t.dropColumn('coverMedia')
    })
  }
}
