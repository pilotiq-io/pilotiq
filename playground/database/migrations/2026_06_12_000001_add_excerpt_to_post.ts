import { Migration, Schema } from '@rudderjs/database'

/**
 * Demo column for the Markdown editor — exercises the `:::alert{type=…}`
 * content-block directive round-trip in the playground (Posts → Content tab).
 */
export default class extends Migration {
  async up() {
    await Schema.table('post', (t) => {
      t.text('excerpt').nullable() // markdown source (MarkdownField)
    })
  }

  async down() {
    await Schema.table('post', (t) => {
      t.dropColumn('excerpt')
    })
  }
}
