import { Migration, Schema } from '@rudderjs/database'

/**
 * Creates the `media` table backing `@pilotiq/media`.
 *
 * **Host migration** — pilotiq runs on rudder's native database engine, where
 * the *app* owns migrations (there's no schema-publish step like the legacy
 * Prisma package had). Copy this file into your app's `database/migrations/`
 * directory and run `pnpm rudder migrate`. The accompanying `Media` model
 * (`@pilotiq/media/server`) binds the generated `media` column types.
 *
 * Files and folders live in one parent-id tree (`type` + `parentId`): a folder
 * has `type:'folder'` with the file-specific columns left null; a file carries
 * `mime / size / filename` and, for images, `width / height / focalX / focalY`
 * plus generated `conversions`.
 */
export default class extends Migration {
  async up() {
    await Schema.create('media', (t) => {
      t.string('id').primary()
      t.string('name')
      t.string('type').default('file')        // 'file' | 'folder'
      t.string('mime').nullable()
      t.integer('size').nullable()            // bytes
      t.string('disk').default('public')      // @rudderjs/storage disk
      t.string('directory').default('')       // path within the disk
      t.string('filename').nullable()         // on-disk key (files only)
      t.integer('width').nullable()
      t.integer('height').nullable()
      t.float('focalX').nullable()            // 0..1 art-direction crop point
      t.float('focalY').nullable()
      t.json('conversions').nullable()        // ConversionInfo[]
      t.string('alt').nullable()
      t.json('meta').nullable()               // arbitrary extra metadata
      t.string('parentId').nullable()         // parent folder, null at root
      t.string('scope').default('shared')     // 'shared' | 'private'
      t.string('userId').nullable()           // owner for private scope
      t.timestamps()
    })
  }

  async down() {
    await Schema.dropIfExists('media')
  }
}
