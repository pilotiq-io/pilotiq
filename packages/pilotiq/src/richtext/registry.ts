/**
 * Server-side rich-text renderer registry.
 *
 * Pilotiq core has no runtime dep on `@pilotiq/tiptap` (or any other
 * adapter), but display surfaces — `TextEntry`, `TextColumn` — want to
 * convert stored Tiptap content to HTML at meta-build time so views and
 * tables render finished markup without shipping the editor parser to
 * the client.
 *
 * Adapter packages (`@pilotiq/tiptap` ships one via `registerTiptap`)
 * register their renderer here. Display surfaces auto-detect richtext
 * values (`isRichTextValue(v)` returns `true`) and pipe them through
 * `getRichTextRenderer()` when one is registered. No registration → no
 * auto-render; the surface falls back to its default formatter.
 *
 * Mirrors the `registerWidgetComponents / registerEntryComponents`
 * pattern — runtime, name-less, single-renderer registry (no plurality
 * needed: a panel only loads one editor adapter).
 */

/**
 * Pure conversion from Tiptap content to HTML. Implementations must be
 * server-safe (no DOM, no Tiptap runtime) and synchronous.
 */
export type RichTextRenderer = (content: unknown) => string

/**
 * Conservative detector — returns `true` only when the value is
 * recognizably Tiptap content. Adapter packages provide their own to
 * keep core agnostic to the storage shape.
 */
export type RichTextDetector = (value: unknown) => boolean

interface Entry {
  render: RichTextRenderer
  detect: RichTextDetector
}

let registered: Entry | undefined

/**
 * Register a richtext renderer + detector. Call once at app boot from a
 * bootstrap provider (or via `registerTiptap(panel)`); subsequent calls
 * overwrite the prior registration.
 *
 * @example
 *   import { registerRichTextRenderer } from '@pilotiq/pilotiq/richtext'
 *   import { renderRichTextToHtml, isRichTextValue } from '@pilotiq/tiptap/render'
 *   registerRichTextRenderer(renderRichTextToHtml, isRichTextValue)
 */
export function registerRichTextRenderer(
  render: RichTextRenderer,
  detect: RichTextDetector,
): void {
  registered = { render, detect }
}

/** Get the registered renderer, or `undefined` when none has been wired. */
export function getRichTextRenderer(): RichTextRenderer | undefined {
  return registered?.render
}

/** Get the registered detector. Returns `undefined` when no renderer is
 *  registered — display surfaces should fall through to default formatting. */
export function getRichTextDetector(): RichTextDetector | undefined {
  return registered?.detect
}

/**
 * Combined helper — when a renderer is registered AND the value passes
 * its detector, render and return the HTML; otherwise return `null` so
 * the caller falls back to its own formatter chain.
 */
export function tryRenderRichText(value: unknown): string | null {
  if (!registered) return null
  if (!registered.detect(value)) return null
  try {
    return registered.render(value)
  } catch {
    // Fail-soft — the caller falls back to plain rendering rather than
    // showing a broken page. Mirrors `Entry._formatState`'s posture.
    return null
  }
}

/** Test-only: clear the registry between tests. Not part of the public surface. */
export function _resetRichTextRegistryForTests(): void {
  registered = undefined
}
