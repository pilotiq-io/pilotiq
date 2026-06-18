import { View, type RenderContext } from '@pilotiq/pilotiq'
import { getLibrary, getDefaultLibrary } from './registry.js'

/**
 * `Media` — the embedded library browser as a schema element. The second of
 * the package's two mount modes: drop it into ANY page / resource schema to get
 * the same browser the `media()` plugin mounts at the global `/media` route.
 *
 * Built on `View` (the escape-hatch widget element), so it inherits the whole
 * server-data pipeline plus layout chrome — `columnSpan()`, `visible()`,
 * `poll()` — for free, and renders through the registered `MediaLibrary`
 * component (host registers it via `registerWidgetComponents({ MediaLibrary })`,
 * same as the global page).
 *
 * @example
 * ```ts
 * // Page.schema()
 * Media.make('Assets')
 *   .library('photos')      // scope uploads to a named library
 *   .directory(folderId)    // open the browser rooted at a folder
 *   .height(640)
 *   .columnSpan(2)
 * ```
 *
 * v1 scoping: `library()` routes uploads to the named library and `directory()`
 * roots the browser at a folder. Filtering the *listing* by library is a
 * follow-up (the `_media` list is one parent-id tree across libraries).
 */
export class Media extends View {
  private _library?:   string
  private _directory?: string
  private _height?:    number

  constructor(id?: string) {
    super(id)
    // Pin the component + eager-mount: the browser does its own fetching, so
    // it must resolve to a non-null payload (a lazy/null View skeletons forever
    // — see MediaLibraryPage).
    this.component('MediaLibrary')
    this.lazy(false)
  }

  static make(id?: string): Media {
    return super.make(id) as Media
  }

  /** Scope uploads to a named library (from `media()` plugin config). */
  library(name: string): this { this._library = name; return this }

  /** Root the browser at a folder (a `_media` folder record id). */
  directory(folderId: string): this { this._directory = folderId; return this }

  /** Min height (px) for the embedded browser. */
  height(px: number): this { this._height = px; return this }

  override async resolveServerData(ctx: RenderContext): Promise<unknown> {
    // The `_media` routes mount at `${panelBase}/_media`. Core always stamps
    // `ctx.uploadUrl = ${panelBase}/_uploads`, so derive the sibling base from
    // it — works in any page location (the client-side `deriveApiBase` is
    // page-slug-relative and only correct on the dedicated `/media` page).
    const uploadUrl = typeof ctx?.uploadUrl === 'string' ? ctx.uploadUrl : undefined
    const panelBase = uploadUrl ? uploadUrl.replace(/\/_uploads$/, '') : undefined
    const apiBase = panelBase ? `${panelBase}/_media` : undefined
    // Custom metadata fields for the edit panel, from the panel-scoped library.
    const lib = panelBase
      ? (this._library ? getLibrary(panelBase, this._library) : getDefaultLibrary(panelBase)) ?? undefined
      : (this._library ? getLibrary(this._library) : getDefaultLibrary()) ?? undefined
    const metaFields = lib?.metaFields
    return {
      ready: true,
      ...(apiBase ? { apiBase } : {}),
      ...(this._library ? { library: this._library } : {}),
      ...(this._directory ? { directory: this._directory } : {}),
      ...(this._height !== undefined ? { height: this._height } : {}),
      ...(metaFields?.length ? { metaFields } : {}),
    }
  }
}
