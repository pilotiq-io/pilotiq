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
 * Coverage matches what `RichTextField` ships in Phases A-G:
 *   nodes — doc / paragraph / heading / blockquote / codeBlock / bulletList
 *           / orderedList / listItem / horizontalRule / hardBreak / text
 *           / image / table / tableRow / tableCell / tableHeader
 *           / details / detailsSummary / detailsContent
 *           / grid / gridColumn
 *           / mergeTag / mention
 *   marks — bold / italic / strike / underline / subscript / superscript
 *           / code / link / textStyle (color) / highlight (color)
 *           / lead (paragraph emphasis) / small (semantic <small>)
 *   attrs — heading.level / orderedList.start / codeBlock.language
 *           / paragraph.textAlign + heading.textAlign
 *           / image.src + alt + title + width + height
 *           / tableCell.colspan + rowspan + colwidth (also tableHeader)
 *           / mergeTag.id / mention.id + label + trigger
 *   default blocks — the `pilotiqBlock` node's built-in types (faq / alert /
 *           summary / key-takeaways / pros-cons) render to semantic
 *           `<div class="pilotiq-...">` markup; consumers own the CSS.
 *   custom blocks — any other type renders to `<div data-type="..."
 *           data-attrs="...">` so consumers can replay or style by data-type.
 */

export interface RenderRichTextOptions {
  /**
   * Override the rendering of a custom block (anything that isn't a
   * built-in node). Receives the raw node; return the HTML string.
   * Default emits `<div data-type="..." data-attrs="...">`.
   */
  renderBlock?: (node: TiptapNode) => string
  /**
   * Substitution map for `{{ tag }}` placeholders inserted via
   * `RichTextField.mergeTags(['name', …])`. When the renderer hits a
   * `mergeTag` node whose `id` is a key in this map, it emits the value
   * (HTML-escaped). Unmatched ids fall back to a styled `<span class="merge-tag">`
   * that preserves the placeholder visually.
   */
  mergeTags?: Record<string, string>
  /**
   * Override the label rendered inside a mention chip at read time. The
   * editor caches the label on insert (so static snapshots stay self-
   * contained), but rendered surfaces can call back into a directory or
   * cache to refresh stale names. Return `undefined` to fall back to the
   * cached label.
   */
  resolveMention?: (trigger: string, id: string) => string | undefined
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
    case 'table':          return renderTable(n, opts)
    case 'tableRow':       return wrap('tr', n, opts)
    case 'tableCell':      return renderCell('td', n, opts)
    case 'tableHeader':    return renderCell('th', n, opts)
    case 'details':        return renderDetails(n, opts)
    case 'detailsSummary': return wrap('summary', n, opts)
    // The editor's NodeView wraps content in a `<div data-type="detailsContent">`
    // for click handling, but the read-side HTML doesn't need a wrapper —
    // a `<details>` block's content sits directly after the `<summary>` per
    // the platform spec, which matches reader expectations.
    case 'detailsContent': return renderChildren(n, opts)
    case 'grid':           return renderGrid(n, opts)
    case 'gridColumn':     return wrap('div', n, opts)
    case 'keyTakeaways':   return labeledBlockHtml('pilotiq-key-takeaways', 'Key takeaways', n, opts)
    case 'summary':        return labeledBlockHtml('pilotiq-summary', 'Summary', n, opts)
    case 'faq':            return labeledBlockHtml('pilotiq-faq', 'FAQ', n, opts)
    case 'faqItem':        return `<div class="pilotiq-faq-item">${renderChildren(n, opts)}</div>`
    case 'faqQuestion':    return `<div class="pilotiq-faq-question"><span class="pilotiq-faq-marker">Q</span><span class="pilotiq-faq-text">${renderChildren(n, opts)}</span></div>`
    case 'faqAnswer':      return `<div class="pilotiq-faq-answer"><span class="pilotiq-faq-marker">A</span><div class="pilotiq-faq-body">${renderChildren(n, opts)}</div></div>`
    case 'alert':          return renderAlertNode(n, opts)
    case 'prosCons':       return `<div class="pilotiq-pros-cons">${renderChildren(n, opts)}</div>`
    case 'prosColumn':     return labeledBlockHtml('pilotiq-pros', 'Pros', n, opts)
    case 'consColumn':     return labeledBlockHtml('pilotiq-cons', 'Cons', n, opts)
    case 'mergeTag':       return renderMergeTag(n, opts)
    case 'mention':        return renderMention(n, opts)
    case 'text':           return renderText(n)
    case 'pilotiqBlock':   return renderPilotiqBlock(n, opts)
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
    case 'lead':        return `<span class="lead">${inner}</span>`
    case 'small':       return `<small>${inner}</small>`
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

// ─── Tables ──────────────────────────────────────────────────────────

/**
 * Render a Tiptap `table` node. The Tiptap table extension stores per-column
 * widths on individual cells via `colwidth: number[]` — we collect the widths
 * from the first row and emit a `<colgroup>` so read-side renders match the
 * editor's column proportions.
 */
function renderTable(n: TiptapNode, opts: RenderRichTextOptions): string {
  const colgroup = buildColgroup(n)
  return `<table>${colgroup}<tbody>${renderChildren(n, opts)}</tbody></table>`
}

function buildColgroup(table: TiptapNode): string {
  const firstRow = table.content?.find((c) => c.type === 'tableRow')
  if (!firstRow || !firstRow.content) return ''
  const widths: (number | null)[] = []
  let hasAnyWidth = false
  for (const cell of firstRow.content) {
    if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') continue
    const colspan = clampPositiveInt(cell.attrs?.['colspan']) ?? 1
    const colwidth = cell.attrs?.['colwidth']
    const widthArr = Array.isArray(colwidth)
      ? colwidth.map((w) => clampPositiveInt(w))
      : []
    for (let i = 0; i < colspan; i++) {
      const w = widthArr[i] ?? null
      if (w !== null) hasAnyWidth = true
      widths.push(w)
    }
  }
  // Only emit a colgroup when at least one width is known. Tiptap's table
  // extension only sets colwidth after the user drags a column-resize handle —
  // out-of-the-box tables have no widths, so an always-emitted colgroup would
  // be noise.
  if (!hasAnyWidth) return ''
  const cols = widths.map((w) => w !== null ? `<col style="width: ${w}px">` : '<col>')
  return `<colgroup>${cols.join('')}</colgroup>`
}

function renderCell(tag: 'td' | 'th', n: TiptapNode, opts: RenderRichTextOptions): string {
  const attrs = (n.attrs ?? {}) as Record<string, unknown>
  const colspan = clampPositiveInt(attrs['colspan'])
  const rowspan = clampPositiveInt(attrs['rowspan'])
  const span = [
    colspan && colspan !== 1 ? ` colspan="${colspan}"` : '',
    rowspan && rowspan !== 1 ? ` rowspan="${rowspan}"` : '',
  ].join('')
  return `<${tag}${span}>${renderChildren(n, opts)}</${tag}>`
}

function clampPositiveInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

// ─── Details (collapsible blocks) ────────────────────────────────────

/**
 * Render a `details` node. The `open` attribute round-trips the editor's
 * open/closed state when `Details.configure({ persist: true })` is set —
 * matches the platform `<details open>` attribute exactly so a reader's
 * snapshot reflects how the author last left it.
 */
function renderDetails(n: TiptapNode, opts: RenderRichTextOptions): string {
  const isOpen = n.attrs?.['open'] === true
  return `<details${isOpen ? ' open' : ''}>${renderChildren(n, opts)}</details>`
}

// ─── Grid (multi-column layout) ──────────────────────────────────────

/**
 * Render a `grid` node. The `data-columns` attribute round-trips the
 * editor's column count; class names mirror the editor's `renderHTML` so
 * one stylesheet paints both surfaces (consumer owns the CSS — same
 * posture as `lead` / `small`).
 *
 * Out-of-range column counts (anything other than 2 or 3) clamp to 2 —
 * the schema enforces it on the editor side, but a tampered Tiptap JSON
 * fed straight to the renderer shouldn't paint a `grid-cols-99` class.
 */
function renderGrid(n: TiptapNode, opts: RenderRichTextOptions): string {
  const cols = clampGridColumnsForRender(n.attrs?.['columns'])
  return `<div class="pilotiq-grid pilotiq-grid-cols-${cols}">${renderChildren(n, opts)}</div>`
}

function clampGridColumnsForRender(raw: unknown): 2 | 3 {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 2
  const trunc = Math.trunc(n)
  return trunc === 3 ? 3 : 2
}

// ─── Inline content blocks (labelled editable nodes) ─────────────────
//
// Mirrors the editor's `renderHTML` (extensions/contentBlocks.ts): a small
// label above an editable body. Consumer owns the `pilotiq-*` CSS. Covers
// keyTakeaways / summary / faq / alert / prosCons (+ pros/cons columns).

function labeledBlockHtml(cssClass: string, label: string, n: TiptapNode, opts: RenderRichTextOptions): string {
  return (
    `<div class="${cssClass}">` +
    `<div class="pilotiq-block-label">${escapeHtml(label)}</div>` +
    `<div class="pilotiq-block-body">${renderChildren(n, opts)}</div>` +
    `</div>`
  )
}

const ALERT_NODE_TYPES = new Set(['info', 'warning', 'success', 'tip'])
const ALERT_NODE_LABEL: Record<string, string> = { info: 'Info', warning: 'Warning', success: 'Success', tip: 'Tip' }

function renderAlertNode(n: TiptapNode, opts: RenderRichTextOptions): string {
  let type = String(n.attrs?.['type'] ?? '').trim().toLowerCase()
  if (!ALERT_NODE_TYPES.has(type)) type = 'info'
  return (
    `<div class="pilotiq-alert pilotiq-alert-${type}" role="note">` +
    `<div class="pilotiq-block-label">${ALERT_NODE_LABEL[type]}</div>` +
    `<div class="pilotiq-block-body">${renderChildren(n, opts)}</div>` +
    `</div>`
  )
}

// ─── Merge tags + mentions ───────────────────────────────────────────

/**
 * Render a `mergeTag` atom — either substitute the value from
 * `opts.mergeTags` (HTML-escaped) or fall back to a styled `<span>` that
 * preserves the placeholder visually so server-rendered previews stay
 * informative when no substitution map is supplied.
 */
function renderMergeTag(n: TiptapNode, opts: RenderRichTextOptions): string {
  const id = String((n.attrs ?? {})['id'] ?? '').trim()
  if (id === '') return ''
  const map = opts.mergeTags
  // Only substitute when the map explicitly carries the id — using
  // `Object.prototype.hasOwnProperty` so `null` / empty-string substitutions
  // still win over the fallback span.
  if (map && Object.prototype.hasOwnProperty.call(map, id)) {
    return escapeHtml(String(map[id] ?? ''))
  }
  return `<span class="merge-tag" data-id="${escapeAttr(id)}">{{ ${escapeHtml(id)} }}</span>`
}

/**
 * Render a `mention` atom as a styled `<span>` carrying the cached label.
 * `opts.resolveMention` can override the label per `(trigger, id)` pair —
 * useful for refreshing display names from a directory at render time.
 * Both `id` and `trigger` are required; missing either drops the chip.
 */
function renderMention(n: TiptapNode, opts: RenderRichTextOptions): string {
  const attrs   = (n.attrs ?? {}) as Record<string, unknown>
  const id      = String(attrs['id']      ?? '').trim()
  const trigger = String(attrs['trigger'] ?? '').trim()
  if (id === '' || trigger === '') return ''
  const cached   = String(attrs['label'] ?? '').trim()
  const resolved = opts.resolveMention?.(trigger, id)
  const label    = resolved !== undefined ? resolved : (cached !== '' ? cached : id)
  return (
    `<span class="mention" data-trigger="${escapeAttr(trigger)}" data-id="${escapeAttr(id)}">` +
    escapeHtml(`${trigger}${label}`) +
    `</span>`
  )
}

// ─── Custom blocks ───────────────────────────────────────────────────

function renderCustomBlock(n: TiptapNode): string {
  const type = String(n.type ?? '')
  const dataAttrs = n.attrs ? ` data-attrs="${escapeAttr(JSON.stringify(n.attrs))}"` : ''
  const inner = n.content ? renderChildren(n, {}) : ''
  return `<div data-type="${escapeAttr(type)}"${dataAttrs}>${inner}</div>`
}

// ─── Default blocks (pilotiqBlock node, keyed on attrs.blockType) ─────
//
// The custom-block node (`pilotiqBlock`) carries `blockType` + `blockData`.
// The blocks shipped by default in `RichTextField` (FAQ / Alert / Summary /
// Key takeaways / Pros & cons) render to semantic HTML here; every other
// (host-defined) block type falls back to `opts.renderBlock` or the generic
// `data-attrs` div. Consumers own the CSS for the `pilotiq-*` classes.

function renderPilotiqBlock(n: TiptapNode, opts: RenderRichTextOptions): string {
  const attrs = (n.attrs ?? {}) as Record<string, unknown>
  const blockType = String(attrs['blockType'] ?? '')
  let data = attrs['blockData']
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { data = {} }
  }
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>

  switch (blockType) {
    case 'faq':           return renderFaqBlock(d)
    case 'alert':         return renderAlertBlock(d)
    case 'summary':       return renderSummaryBlock(d)
    case 'key-takeaways': return renderKeyTakeawaysBlock(d)
    case 'pros-cons':     return renderProsConsBlock(d)
    default:
      if (opts.renderBlock) return opts.renderBlock(n)
      return renderCustomBlock(n)
  }
}

/** Escape a plain-text field value and split blank-line-separated paragraphs. */
function blockParagraphs(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (s === '') return ''
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Coerce a field value to a clean `string[]` (TagsInput stores an array). */
function blockStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? '').trim()).filter((s) => s !== '')
}

function renderFaqBlock(d: Record<string, unknown>): string {
  const items = Array.isArray(d['items']) ? (d['items'] as Array<Record<string, unknown>>) : []
  const body = items
    .map((it) => {
      const q = escapeHtml(String(it['question'] ?? '').trim())
      if (q === '') return ''
      const a = blockParagraphs(it['answer'])
      return `<details class="pilotiq-faq-item"><summary>${q}</summary><div class="pilotiq-faq-answer">${a}</div></details>`
    })
    .join('')
  if (body === '') return ''
  return `<div class="pilotiq-faq">${body}</div>`
}

const ALERT_TYPES = new Set(['info', 'warning', 'success', 'tip'])

function renderAlertBlock(d: Record<string, unknown>): string {
  let type = String(d['type'] ?? '').trim().toLowerCase()
  if (!ALERT_TYPES.has(type)) type = 'info'
  const content = blockParagraphs(d['content'])
  return `<div class="pilotiq-alert pilotiq-alert-${type}" role="note">${content}</div>`
}

function renderSummaryBlock(d: Record<string, unknown>): string {
  const content = blockParagraphs(d['content'])
  if (content === '') return ''
  return (
    `<div class="pilotiq-summary">` +
    `<div class="pilotiq-summary-label">Summary</div>` +
    `<div class="pilotiq-summary-body">${content}</div>` +
    `</div>`
  )
}

function renderKeyTakeawaysBlock(d: Record<string, unknown>): string {
  const points = blockStringList(d['points'])
  if (points.length === 0) return ''
  const lis = points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')
  return (
    `<div class="pilotiq-key-takeaways">` +
    `<div class="pilotiq-key-takeaways-label">Key takeaways</div>` +
    `<ul>${lis}</ul>` +
    `</div>`
  )
}

function renderProsConsBlock(d: Record<string, unknown>): string {
  const pros = blockStringList(d['pros'])
  const cons = blockStringList(d['cons'])
  if (pros.length === 0 && cons.length === 0) return ''
  const column = (label: string, cls: string, items: string[]): string =>
    `<div class="pilotiq-${cls}"><h4>${label}</h4><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
  return `<div class="pilotiq-pros-cons">${column('Pros', 'pros', pros)}${column('Cons', 'cons', cons)}</div>`
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
