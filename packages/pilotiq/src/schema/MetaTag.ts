import { Element } from './Element.js'

/**
 * Head-safe element — emits a `<meta>` tag inside the panel's `<head>`.
 *
 * Returned from `Pilotiq.renderHook('panels::head.start' | 'panels::head.end', …)`
 * callbacks alongside `LinkTag` / `ScriptTag` / `StyleTag`. Schema-side
 * `visible(ctx => …)` / `hidden(ctx => …)` predicates still apply, so a
 * meta can be hidden behind feature flags or per-route logic just like
 * any other Element.
 *
 * Either `name`, `property`, `httpEquiv`, or `charset` must be set —
 * silently skipped at render-time if all four are absent.
 *
 * @example
 *   Pilotiq.renderHook('panels::head.end', () => [
 *     MetaTag.make({ property: 'og:image', content: 'https://…/og.png' }),
 *     MetaTag.make({ name: 'csrf-token', content: req.csrfToken }),
 *   ])
 */
export interface MetaTagAttrs {
  name?:      string
  property?:  string
  httpEquiv?: string
  charset?:   string
  content?:   string
}

export class MetaTag extends Element {
  private constructor(private attrs: MetaTagAttrs) { super() }

  static make(attrs: MetaTagAttrs): MetaTag {
    return new MetaTag(attrs)
  }

  getType(): string { return 'meta' }

  toMeta() {
    return { type: 'meta' as const, ...this.attrs }
  }
}
