import { Element } from './Element.js'

/**
 * Head-safe element — emits an inline `<style>` block inside the panel's
 * `<head>`. Use for CSS-variable overrides, conditional theming, or
 * per-tenant brand colors that need to ship with the SSR document so
 * there's no FOUC.
 *
 * For external stylesheets reach for `LinkTag.make({ rel: 'stylesheet',
 * href: '...' })` instead.
 *
 * @example
 *   Pilotiq.renderHook('panels::styles', ({ user }) => [
 *     StyleTag.make(`
 *       :root { --pilotiq-brand: ${tenantBrand(user)} }
 *     `),
 *   ])
 */
export class StyleTag extends Element {
  private constructor(private css: string, private nonce?: string) { super() }

  static make(css: string, opts?: { nonce?: string }): StyleTag {
    return new StyleTag(css, opts?.nonce)
  }

  getType(): string { return 'style' }

  toMeta() {
    return {
      type: 'style' as const,
      css:  this.css,
      ...(this.nonce ? { nonce: this.nonce } : {}),
    }
  }
}
