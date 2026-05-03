import { Element } from './Element.js'
import type { MarkdownProseSize } from './Markdown.js'

/**
 * Display prime — renders a raw HTML string inline in a schema. Use when
 * the source is already HTML (e.g. legacy CMS column, server-rendered
 * template fragment). For Markdown source reach for `Markdown` instead.
 *
 * Admin-trusted authors only — output is NOT sanitized in v1, matching
 * the existing `MarkdownField` posture. Don't pipe untrusted user input
 * through this without an external sanitizer.
 *
 * @example
 * Html.make('<p>Welcome to <strong>pilotiq</strong>.</p>').prose()
 */
export class Html extends Element {
  private _prose = true
  private _size?: MarkdownProseSize

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

  getType(): string { return 'html' }

  toMeta() {
    return {
      type:  'html' as const,
      html:  this.html,
      prose: this._prose,
      ...(this._size ? { size: this._size } : {}),
    }
  }
}
