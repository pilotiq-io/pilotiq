import type sanitizeHtmlNs from 'sanitize-html'

export type SanitizeConfig = sanitizeHtmlNs.IOptions

/**
 * Default-secure allowlist for `Markdown` and `Html` primes — covers prose
 * content (headings, lists, code, links, images, tables) while blocking
 * `<script>` / `<iframe>`, inline event handlers, `javascript:` URIs, and
 * `style` attribute overrides that could break the surrounding admin chrome.
 *
 * Pass a custom config to `Markdown.sanitize(...)` / `Html.sanitize(...)`
 * when an admin-trusted source needs a wider allowlist (e.g. legacy CMS
 * HTML with embedded media, or a custom block highlighter that emits
 * `style="color:..."` on inline spans).
 */
export const DEFAULT_SANITIZE_CONFIG: SanitizeConfig = {
  allowedTags: [
    'p', 'br', 'hr', 'span', 'div',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
    'sub', 'sup', 'small', 'abbr', 'kbd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  ],
  allowedAttributes: {
    a:    ['href', 'title', 'rel', 'target', 'name'],
    img:  ['src', 'alt', 'title', 'width', 'height'],
    abbr: ['title'],
    th:   ['colspan', 'rowspan', 'scope'],
    td:   ['colspan', 'rowspan'],
    code: ['class'],
    pre:  ['class'],
  },
  allowedSchemes:        ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag:   { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  disallowedTagsMode:    'discard',
}

// Lazy import — keeps `sanitize-html` (and its transitive `postcss` chain that
// reaches into Node built-ins) out of the client bundle. Cached after first
// resolve so per-call overhead is just the `sanitize-html` invocation itself.
// Variable specifier + @vite-ignore so Vite's import analysis never DISCOVERS
// the dep from the client graph either — a literal `import('sanitize-html')`
// is statically analyzable and triggers a lazy "new dependencies optimized"
// reload the first time this (server-only) module is crawled client-side.
let sanitizerPromise: Promise<typeof sanitizeHtmlNs> | null = null
function loadSanitizer(): Promise<typeof sanitizeHtmlNs> {
  const moduleName = 'sanitize-html'
  return sanitizerPromise ??= import(/* @vite-ignore */ moduleName).then(m => m.default ?? m)
}

/**
 * Sanitizes an HTML string against `DEFAULT_SANITIZE_CONFIG` (or a
 * caller-supplied config). Server-side only — never call from a renderer,
 * since the wire shape ships pre-rendered HTML.
 */
export async function sanitizeHtml(html: string, config?: SanitizeConfig): Promise<string> {
  const sanitizer = await loadSanitizer()
  return sanitizer(html, config ?? DEFAULT_SANITIZE_CONFIG)
}
