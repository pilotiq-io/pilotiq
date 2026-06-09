import { Element } from './Element.js'

/**
 * Head-safe element — emits a `<script>` tag inside the panel's `<head>`.
 * Use for analytics snippets (Plausible / Posthog / GA), feature-flag
 * boot scripts, or per-request injected globals.
 *
 * Two mutually-exclusive modes:
 * - **External:** set `src` (and optionally `integrity` / `crossOrigin` /
 *   `async` / `defer`).
 * - **Inline:** set `body` to a JavaScript source string. Rendered via
 *   `dangerouslySetInnerHTML`; the body is the caller's responsibility.
 *
 * `dataAttributes` ride through verbatim onto the rendered element, so
 * vendor SDK hints (`data-domain`, `data-api`) work without a typed slot.
 *
 * @example
 *   Pilotiq.renderHook('panels::scripts', () => [
 *     ScriptTag.make({
 *       src: 'https://plausible.io/js/script.js',
 *       defer: true,
 *       dataAttributes: { domain: 'example.com' },
 *     }),
 *     ScriptTag.make({ body: 'window.__APP_TENANT__ = "acme"' }),
 *   ])
 */
export interface ScriptTagAttrs {
  src?:            string
  body?:           string
  /** Maps to the HTML `type` attribute (`module`, `application/json`, …).
   *  Renamed from `type` because `type` is the wire-shape discriminator. */
  mimeType?:       string
  async?:          boolean
  defer?:          boolean
  noModule?:       boolean
  integrity?:      string
  crossOrigin?:    'anonymous' | 'use-credentials' | ''
  referrerPolicy?: string
  nonce?:          string
  dataAttributes?: Record<string, string>
}

export class ScriptTag extends Element {
  private constructor(private attrs: ScriptTagAttrs) { super() }

  static make(attrs: ScriptTagAttrs): ScriptTag {
    return this.configured(new ScriptTag(attrs))
  }

  getType(): string { return 'script' }

  toMeta() {
    return { ...this.attrs, type: 'script' as const }
  }
}
