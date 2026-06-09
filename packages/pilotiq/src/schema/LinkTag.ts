import { Element } from './Element.js'

/**
 * Head-safe element — emits a `<link>` tag inside the panel's `<head>`.
 * Use for canonical URLs, favicons, manifest hints, preload directives,
 * and stylesheet imports (prefer `StyleTag` for inline CSS).
 *
 * @example
 *   Pilotiq.renderHook('panels::head.start', () => [
 *     LinkTag.make({ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }),
 *     LinkTag.make({ rel: 'canonical', href: 'https://app.example.com' }),
 *   ])
 */
export interface LinkTagAttrs {
  rel:             string
  href?:           string
  /** Maps to the HTML `type` attribute (e.g. `image/svg+xml`, `text/css`).
   *  Renamed from `type` because `type` is the wire-shape discriminator. */
  mimeType?:       string
  media?:          string
  sizes?:          string
  as?:             string
  integrity?:      string
  crossOrigin?:    'anonymous' | 'use-credentials' | ''
  referrerPolicy?: string
  hrefLang?:       string
}

export class LinkTag extends Element {
  private constructor(private attrs: LinkTagAttrs) { super() }

  static make(attrs: LinkTagAttrs): LinkTag {
    return this.configured(new LinkTag(attrs))
  }

  getType(): string { return 'link' }

  toMeta() {
    return { ...this.attrs, type: 'link' as const }
  }
}
