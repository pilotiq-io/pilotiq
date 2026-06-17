// Public, client-safe API. Node-only code (storage / image upload pipeline,
// the upload adapter) lives behind the `@pilotiq/media/server` subpath so it
// never reaches the browser bundle — mirrors `@pilotiq/pilotiq/uploads`.

export type {
  MediaRecord,
  MediaRef,
  ConversionInfo,
  MediaConversion,
  MediaConfig,
  FileCategory,
} from './types.js'
export { categorize, toMediaRef } from './types.js'

export { media } from './plugin.js'
export type { MediaPluginConfig } from './plugin.js'

// The media-library form field — `fieldType: 'media'`. Client-safe (only
// imports the `Field` base from `@pilotiq/pilotiq`). Its renderer registers
// separately via `registerMediaField()` (`@pilotiq/media/widgets`).
export { MediaField, MediaPicker } from './MediaField.js'

// Library registry — client-safe (globalThis-backed, no Node imports), so the
// browser UI + picker field can resolve the active library at render time.
export {
  registerLibrary,
  getLibrary,
  getDefaultLibrary,
  getLibraryNames,
  resetLibraries,
} from './registry.js'
export type { MediaLibrary } from './registry.js'

// The library panel page — registered automatically by the `media()` plugin;
// exported for direct registration too. Client-safe (Page + View, no React).
export { MediaLibraryPage } from './MediaLibraryPage.js'

// Extensible preview registry — keyed by `FileCategory`. Apps register a
// renderer per category to add/override how a file type previews. Client-safe
// (only `react` *types*; the built-in renderers live in `@pilotiq/media/widgets`).
export {
  registerMediaPreview,
  registerMediaPreviews,
  getMediaPreview,
  resolveMediaPreview,
  getMediaPreviewCategories,
  resetMediaPreviews,
} from './preview/registry.js'
export type { MediaPreviewProps, MediaPreviewComponent } from './preview/registry.js'
