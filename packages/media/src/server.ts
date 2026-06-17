// Server-only entry point (`@pilotiq/media/server`). Node-only modules — the
// `Media` model + migration (#213), the `_media` route handlers + storage /
// image upload pipeline (#214), and the `mediaUpload()` UploadAdapter (#216) —
// are exported from here so they stay out of the client bundle.
//
// Scaffold (#212): the subpath seam exists; concrete exports land in the
// slices above. Re-export the client-safe types for convenience server-side.

export type {
  MediaRecord,
  ConversionInfo,
  MediaConversion,
  MediaConfig,
} from './types.js'
