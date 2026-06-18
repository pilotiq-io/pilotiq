/**
 * Library registry — globalThis-backed so it survives Vite SSR module
 * duplication (the same pattern pilotiq uses for its icon / panel-i18n
 * registries). Client-safe: no Node-only imports, so it resolves the active
 * library at SSR time and in the browser bundle alike.
 *
 * Libraries are keyed by BOTH panel path and library name so two panels can
 * register a `'default'` library with different config without clobbering each
 * other. Scoped lookups check the panel-specific map first, then fall back to
 * the unscoped (panel path `''`) map for backward compatibility with callers
 * that don't have panel context (e.g. `mediaUpload()`).
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
  /** Serialized custom metadata field metas (from `MediaConfig.metaFields`),
   *  shipped to the browser edit panel. Client-safe plain objects. */
  metaFields?:    Array<Record<string, unknown>>
}

// ─── Internal two-level map ───────────────────────────────────────────────────
// globalThis key → Map<panelPath, Map<libraryName, MediaLibrary>>
// panelPath '' holds unscoped registrations (backward-compat, mediaUpload()).

const KEY = '__pilotiq_media_libraries__'
const g = globalThis as Record<string, unknown>

function getRoot(): Map<string, Map<string, MediaLibrary>> {
  if (!g[KEY]) g[KEY] = new Map()
  return g[KEY] as Map<string, Map<string, MediaLibrary>>
}

function panelMap(panelPath: string): Map<string, MediaLibrary> {
  const root = getRoot()
  let m = root.get(panelPath)
  if (!m) { m = new Map(); root.set(panelPath, m) }
  return m
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a media library scoped to a panel path (3-arg form, preferred).
 * Or register an unscoped library by name (2-arg form, backward-compat).
 *
 * The plugin calls the 3-arg form so two panels can register a `'default'`
 * library with different config without clobbering each other.
 */
export function registerLibrary(panelPath: string, name: string, library: MediaLibrary): void
export function registerLibrary(name: string, library: MediaLibrary): void
export function registerLibrary(
  ...args: [string, string, MediaLibrary] | [string, MediaLibrary]
): void {
  if (args.length === 3) panelMap(args[0]).set(args[1], args[2])
  else                   panelMap('')    .set(args[0], args[1])
}

/**
 * Resolve a library by panel path + name (2-arg, scoped — preferred).
 * Or resolve by name only (1-arg, unscoped — backward-compat).
 *
 * Scoped lookup checks the panel-specific map first, then falls back to the
 * unscoped map so code that registered via the 2-arg `registerLibrary` is
 * still found.
 */
export function getLibrary(panelPath: string, name: string): MediaLibrary | undefined
export function getLibrary(name: string): MediaLibrary | undefined
export function getLibrary(
  ...args: [string, string] | [string]
): MediaLibrary | undefined {
  if (args.length === 2) return panelMap(args[0]).get(args[1]) ?? panelMap('').get(args[1])
  return panelMap('').get(args[0])
}

/**
 * Resolve the default library for a panel (scoped), or the global default
 * (unscoped, backward-compat). Falls back to `{ disk: 'public', directory:
 * 'media' }` when neither the panel-scoped nor the unscoped `'default'`
 * library is registered.
 */
export function getDefaultLibrary(panelPath?: string): MediaLibrary {
  const scoped   = panelPath ? panelMap(panelPath).get('default') : undefined
  const unscoped = panelMap('').get('default')
  return scoped ?? unscoped ?? { disk: 'public', directory: 'media' }
}

/**
 * All registered library names for a panel (scoped), or across every panel
 * (no arg, for backward-compat).
 */
export function getLibraryNames(panelPath?: string): string[] {
  if (panelPath !== undefined) return [...panelMap(panelPath).keys()]
  // Aggregate unique names across all panel maps.
  const names = new Set<string>()
  for (const m of getRoot().values()) for (const k of m.keys()) names.add(k)
  return [...names]
}

/** Test seam — clear the registry between runs. */
export function resetLibraries(): void {
  getRoot().clear()
}
