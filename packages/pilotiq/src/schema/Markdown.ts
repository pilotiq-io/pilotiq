import { marked } from 'marked'
import { Element } from './Element.js'
import { sanitizeHtml, type SanitizeConfig } from './sanitize.js'

export type MarkdownProseSize = 'sm' | 'base' | 'lg'

/**
 * Display prime — renders read-only Markdown source. Server-side conversion
 * via `marked` (already a dep), client receives finished HTML — no FOUC,
 * no extra parser shipped to display-only pages.
 *
 * Read-only counterpart of `MarkdownField`. For raw HTML strings reach for
 * `Html` instead.
 *
 * **Sanitized by default** against a prose-friendly allowlist (matches
 * Filament v5's default-secure posture) — `<script>` / `<iframe>` /
 * `javascript:` URLs / inline event handlers are stripped before the wire
 * shape ships. Opt out with `.allowRaw()` (admin-trusted source AND
 * reader) or widen the allowlist with `.sanitize({ allowedTags: [...] })`.
 *
 * @example
 * Markdown.make('# Welcome\n\nThanks for **trying** pilotiq.').prose()
 */
export class Markdown extends Element {
  private _gfm    = true
  private _breaks = false
  private _prose  = true
  private _size?:  MarkdownProseSize
  private _sanitize: boolean | SanitizeConfig = true

  private constructor(private source: string) {
    super()
  }

  static make(source: string): Markdown {
    return new Markdown(source)
  }

  /** GitHub-flavored markdown. Default `true`. */
  gfm(v = true): this { this._gfm = v; return this }

  /** Convert single `\n` line breaks to `<br>`. Default `false`. */
  breaks(v = true): this { this._breaks = v; return this }

  /** Wrap output in a `prose` Tailwind Typography container. Default `true`.
   *  Pass `false` to render bare HTML without typographic styling. */
  prose(v = true): this { this._prose = v; return this }

  /** Tailwind Typography size — `prose-sm` / `prose-base` / `prose-lg`. */
  size(s: MarkdownProseSize): this { this._size = s; return this }

  /**
   * Sanitization control. Default `true` — runs the converted HTML through
   * the `DEFAULT_SANITIZE_CONFIG` allowlist before the wire shape ships.
   * Pass `false` to disable (use `.allowRaw()` for the same effect with a
   * clearer intent at the call site). Pass a `sanitize-html` config object
   * to widen the allowlist.
   */
  sanitize(v: boolean | SanitizeConfig = true): this {
    this._sanitize = v
    return this
  }

  /** Sugar — opt out of the default-secure sanitizer entirely. */
  allowRaw(): this { this._sanitize = false; return this }

  getType(): string { return 'markdown' }

  toMeta() {
    const html = marked.parse(this.source, {
      gfm:    this._gfm,
      breaks: this._breaks,
      async:  false,
    }) as string
    const finalHtml = this._sanitize === false
      ? html
      : sanitizeHtml(html, this._sanitize === true ? undefined : this._sanitize)
    return {
      type:  'markdown' as const,
      html:  finalHtml,
      prose: this._prose,
      ...(this._size ? { size: this._size } : {}),
    }
  }
}
