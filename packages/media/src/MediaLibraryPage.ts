import { Page } from '@pilotiq/pilotiq'
import { Media } from './MediaElement.js'

/**
 * The media library panel page. The `media()` plugin registers it on
 * `register(panel)`, so a panel with `media()` gets a `/media` route + a nav
 * entry automatically.
 *
 * Its schema is a single `Media` element — the same embeddable browser element
 * a panel can drop into any page schema. The element resolves the `_media` API
 * base from the render context and mounts the registered `MediaLibrary`
 * component (host registers it via `registerWidgetComponents`), which owns the
 * whole browser UI and talks to the `_media` routes directly.
 */
export class MediaLibraryPage extends Page {
  static override slug  = 'media'
  static override label = 'Media'
  static override icon  = 'image'

  static override schema() {
    return [Media.make('library')]
  }
}
