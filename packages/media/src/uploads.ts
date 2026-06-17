/**
 * `mediaUpload()` — a core {@link UploadAdapter} that targets the media library
 * as its storage backend (#216).
 *
 * Registering it via `Pilotiq.uploads({ adapter: mediaUpload(...) })` makes every
 * core `FileUpload` field write through the same persist + image-conversion
 * pipeline as the `_media/upload` route (#214): the original lands on the
 * library's disk, image conversions are generated, and a `Media` row is created —
 * so uploads from a plain field show up in the library browser and round-trip
 * with previews.
 *
 * Server-only: it statically imports the Node-only `store.ts` (Storage / image /
 * model), so it's exported from `@pilotiq/media/server`, never the client barrel
 * — mirroring how pilotiq core keeps `localUpload` out of its client-safe graph.
 */
import type { UploadAdapter, UploadRequest, UploadResult } from '@pilotiq/pilotiq/uploads'
import { getLibrary, getDefaultLibrary } from './registry.js'
import { uploadFile } from './store.js'

/** Configuration for {@link mediaUpload}. */
export interface MediaUploadConfig {
  /**
   * Name of the registered library to write into. Omit to use the default
   * library (`media()` with no `libraries` registers one). Throws at upload
   * time when a named library isn't registered, so a config typo fails loud
   * rather than silently writing to the default.
   */
  library?: string
}

/**
 * Build an {@link UploadAdapter} that persists files into a media library.
 *
 * Every upload is stored as a `shared` library record. Per-upload storage keys
 * are generated internally (a unique `<slug>-<uuid>` directory per upload), so
 * the adapter does NOT honor the `directory` or `preserveFilenames` request
 * hints — the library owns its on-disk layout (which is what guarantees two
 * uploads of the same name never collide). User-scoped (`private`) uploads need
 * a request-bound user the `UploadAdapter` contract doesn't carry; drive those
 * through the `_media/upload` route instead.
 *
 * @example
 * ```ts
 * // bootstrap/providers.ts (server-only)
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { mediaUpload } from '@pilotiq/media/server'
 *
 * panel.uploads({ adapter: mediaUpload() })            // default library
 * panel.uploads({ adapter: mediaUpload({ library: 'photos' }) })
 * ```
 */
export function mediaUpload(config: MediaUploadConfig = {}): UploadAdapter {
  return {
    async put(req: UploadRequest): Promise<UploadResult> {
      const library = config.library
        ? getLibrary(config.library) ?? throwUnregistered(config.library)
        : getDefaultLibrary()

      const media = await uploadFile(
        { file: req.file, parentId: null, alt: null },
        library,
        { scope: 'shared', userId: null },
      )

      if (!media.url) {
        // A FileUpload field needs a resolvable URL to store in the form value;
        // a disk with no public URL (e.g. a private remote bucket) can't back one.
        throw new Error(
          `mediaUpload: the "${media.disk}" disk produced no public URL for the upload. ` +
            `Use a disk with a public base URL for FileUpload-backed media.`,
        )
      }

      return {
        url: media.url,
        meta: {
          id:     media.id,
          mime:   media.mime,
          size:   media.size,
          width:  media.width,
          height: media.height,
        },
      }
    },
  }
}

function throwUnregistered(name: string): never {
  throw new Error(
    `mediaUpload: media library "${name}" is not registered. ` +
      `Register it via media({ libraries: { ${name}: { ... } } }) before wiring the adapter.`,
  )
}
