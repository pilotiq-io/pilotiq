// Public, client-safe API. Node-only code (storage / image upload pipeline,
// the upload adapter) lives behind the `@pilotiq/media/server` subpath so it
// never reaches the browser bundle — mirrors `@pilotiq/pilotiq/uploads`.

export type {
  MediaRecord,
  ConversionInfo,
  MediaConversion,
  MediaConfig,
  FileCategory,
} from './types.js'
export { categorize } from './types.js'

export { media } from './plugin.js'
export type { MediaPluginConfig } from './plugin.js'

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
