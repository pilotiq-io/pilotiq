import { Page, View } from '@pilotiq/pilotiq'

/**
 * The media library panel page. The `media()` plugin registers it on
 * `register(panel)`, so a panel with `media()` gets a `/media` route + a nav
 * entry automatically.
 *
 * Its schema is a single `View` widget pointing at the `MediaLibrary`
 * component (registered by the host via `registerWidgetComponents`). The
 * component owns the whole browser UI and talks to the `_media` routes
 * directly.
 *
 * `lazy(false)` mounts it immediately, and `getDataHandler` returns a non-null
 * payload: the widget runtime treats `data === null` as "still loading" and
 * paints a skeleton forever, so an eager widget MUST resolve to something. The
 * component does its own fetching, so the payload is just a ready sentinel.
 */
export class MediaLibraryPage extends Page {
  static override slug  = 'media'
  static override label = 'Media'
  static override icon  = 'image'

  static override schema() {
    return [
      View.make('library')
        .component('MediaLibrary')
        .lazy(false)
        .getDataHandler(() => ({ ready: true })),
    ]
  }
}
