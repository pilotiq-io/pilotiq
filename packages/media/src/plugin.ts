import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import type { MediaConfig } from './types.js'
import { registerLibrary, type MediaLibrary } from './registry.js'
import { registerMediaRoutes } from './routes.js'
import { MediaLibraryPage } from './MediaLibraryPage.js'

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
 * `register()`. #214: `registerRoutes(router, pilotiq)` mounts the `_media`
 * CRUD + upload pipeline. The browser UI lands in #215.
 */
export function media(config: MediaPluginConfig = {}): PilotiqPlugin {
  return {
    name: '@pilotiq/media',
    register(panel) {
      // The top-level `MediaConfig` fields form the `default` library; any
      // `libraries` map adds named ones alongside it. A bare `media()` still
      // registers a `default` from the resolveLibrary fallbacks.
      registerLibrary('default', resolveLibrary(config))
      for (const [name, cfg] of Object.entries(config.libraries ?? {})) {
        registerLibrary(name, resolveLibrary(cfg))
      }

      // #215: mount the library browser as a panel page (auto-routes +
      // auto-nav). `pages()` REPLACES the array, so we append to the current
      // set — and dedupe so a re-applied plugin doesn't double-register.
      // (Apply `media()` AFTER any `.pages([...])` call, since that call
      // would otherwise replace the appended page.) The host registers the
      // `MediaLibrary` widget component (client) via `registerWidgetComponents`
      // — see `@pilotiq/media/widgets`.
      const pages = panel.getConfig().pages
      if (!pages.includes(MediaLibraryPage)) {
        panel.pages([...pages, MediaLibraryPage])
      }
    },
    // #214: mount the `_media` CRUD + upload routes under the panel base.
    // Runs server-side only; `registerMediaRoutes` defers its Node-only
    // store (Storage / image / model) to a lazy import inside each handler,
    // so this stays client-safe to load alongside the panel module.
    registerRoutes(router, pilotiq) {
      registerMediaRoutes(router, pilotiq)
    },
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
    ...(cfg.metaFields?.length ? { metaFields: cfg.metaFields.map(f => f.toMeta()) } : {}),
  }
}
