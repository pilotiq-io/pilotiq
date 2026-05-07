import { Element } from './Element.js'
import type { MarkdownProseSize } from './Markdown.js'
import { sanitizeHtml, type SanitizeConfig } from './sanitize.js'

/**
 * Display prime — renders a raw HTML string inline in a schema. Use when
 * the source is already HTML (e.g. legacy CMS column, server-rendered
 * template fragment). For Markdown source reach for `Markdown` instead.
 *
 * **Sanitized by default** against a prose-friendly allowlist (matches
 * Filament v5's default-secure posture) — `<script>` / `<iframe>` /
 * `javascript:` URLs / inline event handlers are stripped before the wire
 * shape ships. Opt out with `.allowRaw()` (only when the source is fully
 * admin-trusted AND already sanitized upstream) or widen the allowlist
 * with `.sanitize({ allowedTags: [...] })`.
 *
 * @example
 * Html.make('<p>Welcome to <strong>pilotiq</strong>.</p>').prose()
 */
export class Html extends Element {
  private _prose = true
  private _size?: MarkdownProseSize
  private _sanitize: boolean | SanitizeConfig = true

  private constructor(private html: string) {
    super()
  }

  static make(html: string): Html {
    return new Html(html)
  }

  /** Wrap output in a `prose` Tailwind Typography container. Default `true`. */
  prose(v = true): this { this._prose = v; return this }

  /** Tailwind Typography size — `prose-sm` / `prose-base` / `prose-lg`. */
  size(s: MarkdownProseSize): this { this._size = s; return this }

  /**
   * Sanitization control. Default `true` — runs the source through the
   * `DEFAULT_SANITIZE_CONFIG` allowlist before the wire shape ships. Pass
   * `false` to disable (use `.allowRaw()` for the same effect with a
   * clearer intent at the call site). Pass a `sanitize-html` config
   * object to widen the allowlist.
   */
  sanitize(v: boolean | SanitizeConfig = true): this {
    this._sanitize = v
    return this
  }

  /** Sugar — opt out of the default-secure sanitizer entirely. */
  allowRaw(): this { this._sanitize = false; return this }

  getType(): string { return 'html' }

  toMeta() {
    const html = this._sanitize === false
      ? this.html
      : sanitizeHtml(this.html, this._sanitize === true ? undefined : this._sanitize)
    return {
      type:  'html' as const,
      html,
      prose: this._prose,
      ...(this._size ? { size: this._size } : {}),
    }
  }
}
