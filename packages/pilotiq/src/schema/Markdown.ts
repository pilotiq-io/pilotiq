import { marked } from 'marked'
import { Element } from './Element.js'

export type MarkdownProseSize = 'sm' | 'base' | 'lg'

/**
 * Display prime — renders read-only Markdown source. Server-side conversion
 * via `marked` (already a dep), client receives finished HTML — no FOUC,
 * no extra parser shipped to display-only pages.
 *
 * Read-only counterpart of `MarkdownField`. For raw HTML strings (already
 * sanitized/trusted upstream) reach for `Html` instead.
 *
 * Admin-trusted authors only — output is NOT sanitized in v1, matching
 * the existing `MarkdownField` posture.
 *
 * @example
 * Markdown.make('# Welcome\n\nThanks for **trying** pilotiq.').prose()
 */
export class Markdown extends Element {
  private _gfm    = true
  private _breaks = false
  private _prose  = true
  private _size?:  MarkdownProseSize

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

  getType(): string { return 'markdown' }

  toMeta() {
    const html = marked.parse(this.source, {
      gfm:    this._gfm,
      breaks: this._breaks,
      async:  false,
    }) as string
    return {
      type:  'markdown' as const,
      html,
      prose: this._prose,
      ...(this._size ? { size: this._size } : {}),
    }
  }
}
