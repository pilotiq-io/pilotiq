// Server-only entry point (`@pilotiq/media/server`). Node-only modules — the
// `Media` model + migration (#213), the `_media` route handlers + storage /
// image upload pipeline (#214), and the `mediaUpload()` UploadAdapter (#216) —
// are exported from here so they stay out of the client bundle.
//
// Importing this module also activates the `SchemaRegistry['media']`
// augmentation declared alongside the `Media` model.

export type {
  MediaRecord,
  ConversionInfo,
  MediaConversion,
  MediaConfig,
} from './types.js'

// #213: native-engine persistence. `Media` is the model; the migration ships
// as a copyable file under the package's `migrations/` dir (see README) —
// pilotiq's view-based runtime has no schema-publish step, so the host app
// owns migrations.
export { Media } from './Media.js'

// #214: `_media` CRUD routes + the storage / image upload pipeline. The
// `media()` plugin wires `registerMediaRoutes` automatically via its
// `registerRoutes` hook; it's re-exported here for direct mounting from a
// provider. The `store.ts` functions back the route handlers and are exposed
// for host code that wants to drive the library programmatically.
export { registerMediaRoutes } from './routes.js'
export {
  listMedia,
  getMedia,
  createFolder,
  uploadFile,
  renameMedia,
  moveMedia,
  deleteMedia,
  MediaRequestError,
} from './store.js'
export type { MediaListResult } from './store.js'
export type { MediaAuth, ListQuery } from './pipeline.js'
