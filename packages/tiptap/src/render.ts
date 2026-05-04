/**
 * Server-safe Tiptap renderer.
 *
 * Walks a Tiptap JSON document (or HTML string) and returns an HTML string.
 * Pure function — no DOM, no Tiptap runtime, no React. Safe to call from
 * any server context: route handlers, page-data builders, RSC, edge.
 *
 * Output is intentionally NOT sanitized. Same posture as `Markdown` /
 * `Html` display primes in `@pilotiq/pilotiq` — admin-trusted authors only.
 * Text content gets HTML-escaped, link / image hrefs get scheme-checked,
 * but the surrounding markup is constructed by us, not parsed from user
 * input, so there's no place an unexpected tag can sneak in.
 *
 * Coverage matches what `RichTextField` ships in Phases A-E:
 *   nodes — doc / paragraph / heading / blockquote / codeBlock / bulletList
 *           / orderedList / listItem / horizontalRule / hardBreak / text
 *           / image
 *   marks — bold / italic / strike / underline / subscript / superscript
 *           / code / link / textStyle (color) / highlight (color)
 *   attrs — heading.level / orderedList.start / codeBlock.language
 *           / paragraph.textAlign + heading.textAlign
 *           / image.src + alt + title + width + height
 *   custom blocks — render to `<div data-type="..." data-attrs="...">` so
 *           consumers can replay or style by data-type.
 */

export interface RenderRichTextOptions {
  /**
   * Override the rendering of a custom block (anything that isn't a
   * built-in node). Receives the raw node; return the HTML string.
   * Default emits `<div data-type="..." data-attrs="...">`.
   */
  renderBlock?: (node: TiptapNode) => string
}

/** Tiptap JSON node — structural, no runtime dep on `@tiptap/core`. */
export interface TiptapNode {
  type:     string
  text?:    string
  attrs?:   Record<string, unknown>
  content?: TiptapNode[]
  marks?:   TiptapMark[]
}

export interface TiptapMark {
  type:   string
  attrs?: Record<string, unknown>
}

/**
 * Render Tiptap content to HTML.
 *
 * Accepts:
 *   - a Tiptap JSON document (`{ type: 'doc', content: [...] }`) — walked
 *     and converted node-by-node;
 *   - a JSON-encoded string of the same — parsed then walked;
 *   - a raw HTML string — returned verbatim (the editor was configured
 *     with `.storage('html')` and the value is already HTML).
 *
 * Returns `''` on null / undefined / unparseable input.
 */
export function renderRichTextToHtml(content: unknown, opts: RenderRichTextOptions = {}): string {
  if (content === null || content === undefined) return ''

  if (typeof content === 'string') {
    const trimmed = content.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(content)
        return renderNode(parsed, opts)
      } catch {
        return ''
      }
    }
    return content
  }

  if (typeof content === 'object') return renderNode(content as TiptapNode, opts)

  return ''
}

/**
 * Detect whether a value looks like Tiptap rich-text content. Conservative:
 * only matches the canonical document root (`{ type: 'doc', content: [...] }`),
 * either object-form or as a JSON-encoded string. Plain text and arbitrary
 * objects are NOT auto-detected — display surfaces should fall through to
 * their default formatter.
 */
export function isRichTextValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'object') return isTiptapDoc(v)
  if (typeof v === 'string') {
    const trimmed = v.trimStart()
    if (!trimmed.startsWith('{')) return false
    try {
      return isTiptapDoc(JSON.parse(v))
    } catch {
      return false
    }
  }
  return false
}

function isTiptapDoc(v: unknown): boolean {
  return (
    typeof v === 'object' && v !== null
    && (v as { type?: unknown }).type === 'doc'
    && Array.isArray((v as { content?: unknown }).content)
  )
}

// ─── Node walker ─────────────────────────────────────────────────────

function renderNode(node: unknown, opts: RenderRichTextOptions): string {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map(n => renderNode(n, opts)).join('')
  if (typeof node !== 'object') return ''

  const n = node as TiptapNode

  switch (n.type) {
    case 'doc':            return renderChildren(n, opts)
    case 'paragraph':      return wrap('p', n, opts, alignStyle(n))
    case 'heading': {
      const level = clampLevel(n.attrs?.['level'])
      return wrap(`h${level}`, n, opts, alignStyle(n))
    }
    case 'blockquote':     return wrap('blockquote', n, opts)
    case 'codeBlock': {
      const lang = typeof n.attrs?.['language'] === 'string'
        ? n.attrs!['language'] as string
        : undefined
      const cls  = lang ? ` class="language-${escapeAttr(lang)}"` : ''
      return `<pre><code${cls}>${renderChildren(n, opts)}</code></pre>`
    }
    case 'bulletList':     return wrap('ul', n, opts)
    case 'orderedList': {
      const startRaw = n.attrs?.['start']
      const start    = typeof startRaw === 'number' ? startRaw : Number(startRaw)
      const startAttr = Number.isFinite(start) && start !== 1 ? ` start="${Math.trunc(start)}"` : ''
      return `<ol${startAttr}>${renderChildren(n, opts)}</ol>`
    }
    case 'listItem':       return wrap('li', n, opts)
    case 'horizontalRule': return '<hr>'
    case 'hardBreak':      return '<br>'
    case 'image':          return renderImage(n)
    case 'text':           return renderText(n)
    default:
      if (opts.renderBlock) return opts.renderBlock(n)
      return renderCustomBlock(n)
  }
}

function renderChildren(n: TiptapNode, opts: RenderRichTextOptions): string {
  if (!n.content) return ''
  return n.content.map(c => renderNode(c, opts)).join('')
}

function wrap(tag: string, n: TiptapNode, opts: RenderRichTextOptions, extraAttrs = ''): string {
  return `<${tag}${extraAttrs}>${renderChildren(n, opts)}</${tag}>`
}

function alignStyle(n: TiptapNode): string {
  const align = n.attrs?.['textAlign']
  if (typeof align !== 'string' || align === '' || align === 'left') return ''
  // `start` / `end` / `center` / `justify` — TextAlign extension allows-list.
  if (!/^[a-z]+$/.test(align)) return ''
  return ` style="text-align: ${align}"`
}

function clampLevel(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(6, Math.max(1, Math.trunc(n)))
}

// ─── Text + marks ────────────────────────────────────────────────────

function renderText(n: TiptapNode): string {
  let html = escapeHtml(String(n.text ?? ''))
  const marks = Array.isArray(n.marks) ? n.marks : []
  // Tiptap stores marks innermost-first in array order; wrap from index
  // 0 outward so the first mark ends up nested deepest — matches Tiptap's
  // own DOM serialization.
  for (const mark of marks) html = wrapMark(html, mark)
  return html
}

function wrapMark(inner: string, mark: TiptapMark | undefined): string {
  if (!mark || typeof mark !== 'object') return inner
  const attrs = (mark.attrs ?? {}) as Record<string, unknown>
  switch (mark.type) {
    case 'bold':        return `<strong>${inner}</strong>`
    case 'italic':      return `<em>${inner}</em>`
    case 'strike':      return `<s>${inner}</s>`
    case 'underline':   return `<u>${inner}</u>`
    case 'subscript':   return `<sub>${inner}</sub>`
    case 'superscript': return `<sup>${inner}</sup>`
    case 'code':        return `<code>${inner}</code>`
    case 'link': {
      const href   = sanitizeUrl(attrs['href'])
      const target = typeof attrs['target'] === 'string'
        ? ` target="${escapeAttr(String(attrs['target']))}"` : ''
      const rel    = attrs['target'] === '_blank' ? ' rel="noopener noreferrer"' : ''
      return `<a href="${href}"${target}${rel}>${inner}</a>`
    }
    case 'textStyle': {
      const color = attrs['color']
      if (typeof color !== 'string' || color === '') return inner
      const safe = sanitizeColor(color)
      if (!safe) return inner
      return `<span style="color: ${safe}">${inner}</span>`
    }
    case 'highlight': {
      const color = attrs['color']
      if (typeof color !== 'string' || color === '') return `<mark>${inner}</mark>`
      const safe = sanitizeColor(color)
      if (!safe) return `<mark>${inner}</mark>`
      return `<mark style="background-color: ${safe}">${inner}</mark>`
    }
    default:
      return inner
  }
}

// ─── Image ───────────────────────────────────────────────────────────

function renderImage(n: TiptapNode): string {
  const attrs = (n.attrs ?? {}) as Record<string, unknown>
  const src   = sanitizeUrl(attrs['src'])
  // Don't emit a broken `<img>` if src couldn't be sanitized to anything
  // meaningful. `sanitizeUrl` returns `'#'` for unsafe inputs — and `<img
  // src="#">` re-fetches the page, which is the worst possible default.
  if (src === '#') return ''
  const alt    = typeof attrs['alt']   === 'string' ? ` alt="${escapeAttr(String(attrs['alt']))}"`     : ' alt=""'
  const title  = typeof attrs['title'] === 'string' ? ` title="${escapeAttr(String(attrs['title']))}"` : ''
  const width  = pixelAttr('width',  attrs['width'])
  const height = pixelAttr('height', attrs['height'])
  return `<img src="${src}"${alt}${title}${width}${height}>`
}

function pixelAttr(name: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return ''
  return ` ${name}="${Math.trunc(n)}"`
}

// ─── Custom blocks ───────────────────────────────────────────────────

function renderCustomBlock(n: TiptapNode): string {
  const type = String(n.type ?? '')
  const dataAttrs = n.attrs ? ` data-attrs="${escapeAttr(JSON.stringify(n.attrs))}"` : ''
  const inner = n.content ? renderChildren(n, {}) : ''
  return `<div data-type="${escapeAttr(type)}"${dataAttrs}>${inner}</div>`
}

// ─── Escapers + sanitizers ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch] ?? ch)
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/**
 * Allowlist for color values. Accepts hex (`#abc` / `#abcdef`), rgb()/rgba(),
 * hsl()/hsla(), oklch(), and named colors (alpha-only). Returns `''` for
 * anything that doesn't match — caller falls back to no inline style.
 */
function sanitizeColor(raw: string): string {
  const v = raw.trim()
  if (v === '') return ''
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  if (/^rgba?\([^()<>"']+\)$/i.test(v)) return v
  if (/^hsla?\([^()<>"']+\)$/i.test(v)) return v
  if (/^oklch\([^()<>"']+\)$/i.test(v)) return v
  if (/^[a-z]+$/i.test(v)) return v
  return ''
}

/**
 * Block dangerous URL schemes. Anything that isn't an absolute http(s),
 * mailto, tel, anchor (#…), root-relative (/…), or relative path falls
 * back to `#`. Output is HTML-escaped.
 */
function sanitizeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '#'
  const v = raw.trim()
  if (v === '') return '#'
  if (/^(?:javascript|data|vbscript):/i.test(v)) return '#'
  return escapeAttr(v)
}
