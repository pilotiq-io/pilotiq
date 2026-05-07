import type { PilotiqPlugin } from '@pilotiq/pilotiq'
import { registerTiptap } from './register.js'

/**
 * Pilotiq plugin that registers the Tiptap rich-text renderer.
 *
 * Use with `Pilotiq.make(...).plugins([tiptap()])` instead of calling
 * `registerTiptap()` directly from your app's client entry — the plugin
 * runs through the panel module so it's wired in one place.
 *
 * @example
 * ```ts
 * import { Pilotiq } from '@pilotiq/pilotiq'
 * import { tiptap } from '@pilotiq/tiptap'
 *
 * Pilotiq.make('Admin').plugins([tiptap()])
 * ```
 */
export function tiptap(): PilotiqPlugin {
  return {
    name: '@pilotiq/tiptap',
    register() {
      registerTiptap()
    },
  }
}
