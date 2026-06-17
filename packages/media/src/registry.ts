/**
 * Library registry — globalThis-backed so it survives Vite SSR module
 * duplication (the same pattern pilotiq uses for its icon / panel-i18n
 * registries). Client-safe: no Node-only imports, so it resolves the active
 * library at SSR time and in the browser bundle alike.
 */
import type { MediaConversion } from './types.js'

/**
 * A resolved media library — where its files live plus the upload rules.
 * The plugin builds these from `MediaConfig` (filling `disk` / `directory`
 * defaults) and registers them by name.
 */
export interface MediaLibrary {
  /** Storage disk the library's files live on (`@rudderjs/storage`). */
  disk:           string
  /** Base directory within the disk. */
  directory:      string
  /** Accepted MIME patterns (mirrors the HTML `accept` attribute). */
  accept?:        string[]
  /** Max upload size in bytes. */
  maxUploadSize?: number
  /** Default conversions generated for every image upload. */
  conversions?:   MediaConversion[]
}

const KEY = '__pilotiq_media_libraries__'
const g = globalThis as Record<string, unknown>

function getMap(): Map<string, MediaLibrary> {
  if (!g[KEY]) g[KEY] = new Map<string, MediaLibrary>()
  return g[KEY] as Map<string, MediaLibrary>
}

/** Register a named media library. Called by the `media()` plugin at boot. */
export function registerLibrary(name: string, library: MediaLibrary): void {
  getMap().set(name, library)
}

/** Resolve a named media library, or `undefined` when it isn't registered. */
export function getLibrary(name: string): MediaLibrary | undefined {
  return getMap().get(name)
}

/**
 * Resolve the default library. Falls back to a sensible default
 * (`disk: 'public'`, `directory: 'media'`) when the plugin hasn't registered
 * one — so a bare `media()` always has a target.
 */
export function getDefaultLibrary(): MediaLibrary {
  return getMap().get('default') ?? { disk: 'public', directory: 'media' }
}

/** Every registered library name, in insertion order. */
export function getLibraryNames(): string[] {
  return [...getMap().keys()]
}

/** Test seam — clear the registry between runs. */
export function resetLibraries(): void {
  getMap().clear()
}
