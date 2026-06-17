import { Model } from '@rudderjs/orm'

/**
 * Generated column types for the `media` table. `@pilotiq/media` ships its own
 * `Media` model (it doesn't live in the host app's `app/Models/**`), so we
 * declare the registry shape here rather than relying on the host's
 * `rudder schema:types` sweep.
 *
 * The shape mirrors exactly what the generator emits for the `media` migration
 * on the native engine once the model's `casts` are folded in: SQLite affinity
 * maps `string`/`json`/`timestamp` columns to `TEXT` and integer/float columns
 * to `INTEGER`/`REAL`, then the `json` casts on `conversions` / `meta` refine
 * those two `TEXT` columns to `unknown`. Register `Media` in a host provider
 * (`ModelRegistry.register(Media)`) before `pnpm rudder migrate` so the host's
 * regenerated `media` block folds the same casts and merges identically.
 */
declare module '@rudderjs/orm' {
  interface SchemaRegistry {
    media: {
      id:          string
      name:        string
      type:        string
      mime:        string | null
      size:        number | null
      disk:        string
      directory:   string
      filename:    string | null
      width:       number | null
      height:      number | null
      focalX:      number | null
      focalY:      number | null
      conversions: unknown | null
      alt:         string | null
      meta:        unknown | null
      parentId:    string | null
      scope:       string
      userId:      string | null
      createdAt:   string | null
      updatedAt:   string | null
    }
  }
}

/**
 * The media library record — a file or a folder, in one parent-id tree.
 *
 * Native-engine model (no Prisma). The `conversions` and `meta` JSON columns
 * round-trip through `static casts`: the cast serializes the object to a JSON
 * string on write (better-sqlite3 only binds primitives) and revives it on
 * read. Timestamps stay raw ISO strings, matching the host's other native
 * models (the ORM manages them automatically).
 *
 * Pair the model with the package's `create_media_table` migration — copy it
 * into the host app's `database/migrations/` and run `pnpm rudder migrate`.
 */
export class Media extends Model.for<'media'>() {
  static override table = 'media'
  static override keyType = 'ulid' as const

  static override casts = {
    conversions: 'json' as const,
    meta:        'json' as const,
  }
}
