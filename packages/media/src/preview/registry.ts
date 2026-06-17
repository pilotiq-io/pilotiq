/**
 * Extensible media-preview registry, keyed by `FileCategory`
 * (`categorize(mime)`). This replaces the legacy hard-coded MIME `switch`:
 * adding support for a new file type = registering a renderer, not editing a
 * central component.
 *
 * globalThis-backed so it survives Vite SSR module duplication (the same
 * pattern the library + icon registries use). Client-safe — only `react` types
 * + the pure `categorize` helper.
 */
import type { ComponentType } from 'react'
import { categorize, type FileCategory } from '../types.js'
import type { MediaRecord } from '../types.js'

/** Props every preview renderer receives. */
export interface MediaPreviewProps {
  /** Public URL of the original file. */
  url:    string
  /** MIME type (or `null` when unknown). */
  mime:   string | null
  /** Display name. */
  name:   string
  /** The full record (conversions, dimensions, alt, …) for richer previews. */
  record: MediaRecord
}

export type MediaPreviewComponent = ComponentType<MediaPreviewProps>

const KEY = '__pilotiq_media_previews__'
const g = globalThis as Record<string, unknown>

function getMap(): Map<FileCategory, MediaPreviewComponent> {
  if (!g[KEY]) g[KEY] = new Map<FileCategory, MediaPreviewComponent>()
  return g[KEY] as Map<FileCategory, MediaPreviewComponent>
}

/** Register (or replace) the preview renderer for a file category. */
export function registerMediaPreview(category: FileCategory, component: MediaPreviewComponent): void {
  getMap().set(category, component)
}

/** Register many at once. */
export function registerMediaPreviews(map: Partial<Record<FileCategory, MediaPreviewComponent>>): void {
  for (const key of Object.keys(map) as FileCategory[]) {
    const c = map[key]
    if (c) getMap().set(key, c)
  }
}

/** The renderer registered for a category, or `undefined`. */
export function getMediaPreview(category: FileCategory): MediaPreviewComponent | undefined {
  return getMap().get(category)
}

/**
 * Resolve a renderer for a MIME type: the category's renderer, falling back to
 * the `'other'` (fallback) renderer. Returns `undefined` only when nothing —
 * not even a fallback — is registered.
 */
export function resolveMediaPreview(mime: string | null): MediaPreviewComponent | undefined {
  const map = getMap()
  return map.get(categorize(mime)) ?? map.get('other')
}

/** Every category that currently has a renderer, in insertion order. */
export function getMediaPreviewCategories(): FileCategory[] {
  return [...getMap().keys()]
}

/** Test seam — clear the registry between runs. */
export function resetMediaPreviews(): void {
  getMap().clear()
}
