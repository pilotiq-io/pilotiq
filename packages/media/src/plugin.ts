import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import type { MediaConfig } from './types.js'

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
 * Scaffold (#212): the plugin is wired but inert. The library registry +
 * persistence land in #213, the `_media` routes + upload pipeline in #214,
 * and the browser UI in #215.
 */
export function media(config: MediaPluginConfig = {}): PilotiqPlugin {
  return {
    name: '@pilotiq/media',
    register() {
      // #213: register configured libraries into the library registry.
      void config
    },
    // #214: registerRoutes(router, pilotiq) mounts the `_media` CRUD +
    // upload pipeline. Added in the server slice.
  }
}
