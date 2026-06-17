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
