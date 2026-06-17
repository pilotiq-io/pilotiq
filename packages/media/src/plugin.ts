import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import type { MediaConfig } from './types.js'
import { registerLibrary, type MediaLibrary } from './registry.js'

/**
 * Configuration for the media plugin.
 *
 * **Single default library:**
 * ```ts
 * media({ disk: 'public', directory: 'media', conversions: [...] })
 * ```
 *
 * **Named libraries:**
 * ```ts
 * media({
 *   libraries: {
 *     photos:    { disk: 'public', directory: 'photos', acceptedMimes: ['image/*'] },
 *     documents: { disk: 'public', directory: 'docs',   acceptedMimes: ['application/pdf'] },
 *   },
 * })
 * ```
 *
 * **No config** (default library: `disk: 'public'`, `directory: 'media'`):
 * ```ts
 * media()
 * ```
 */
export interface MediaPluginConfig extends MediaConfig {
  /** Named media libraries. */
  libraries?: Record<string, MediaConfig>
}

/**
 * The `@pilotiq/media` plugin: a browsable media / file library mountable
 * inside a panel.
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { media } from '@pilotiq/media'
 *
 * Pilotiq.make('Admin').plugins([media()])
 * ```
 *
 * #213: the plugin resolves its config into the library registry on
 * `register()`. The `_media` routes + upload pipeline land in #214 (via
 * `registerRoutes`), and the browser UI in #215.
 */
export function media(config: MediaPluginConfig = {}): PilotiqPlugin {
  return {
    name: '@pilotiq/media',
    register() {
      // The top-level `MediaConfig` fields form the `default` library; any
      // `libraries` map adds named ones alongside it. A bare `media()` still
      // registers a `default` from the resolveLibrary fallbacks.
      registerLibrary('default', resolveLibrary(config))
      for (const [name, cfg] of Object.entries(config.libraries ?? {})) {
        registerLibrary(name, resolveLibrary(cfg))
      }
    },
    // #214: registerRoutes(router, pilotiq) mounts the `_media` CRUD +
    // upload pipeline. Added in the server slice.
  }
}

/** Fill a `MediaConfig`'s optional fields into a resolved `MediaLibrary`. */
function resolveLibrary(cfg: MediaConfig): MediaLibrary {
  return {
    disk:      cfg.disk ?? 'public',
    directory: cfg.directory ?? 'media',
    ...(cfg.acceptedMimes !== undefined ? { accept: cfg.acceptedMimes } : {}),
    ...(cfg.maxUploadSize !== undefined ? { maxUploadSize: cfg.maxUploadSize } : {}),
    ...(cfg.conversions !== undefined ? { conversions: cfg.conversions } : {}),
  }
}
