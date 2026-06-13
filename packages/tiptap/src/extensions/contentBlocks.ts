import { Node, Extension, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { AlertNodeView } from '../react/AlertNodeView.js'
import { FaqNodeView } from '../react/FaqNodeView.js'
import { FaqItemNodeView } from '../react/FaqItemNodeView.js'
import { coerceAlertType, type AlertType } from './alertVariants.js'

// Re-exported for back-compat — the canonical definitions live in
// `alertVariants.ts` (shared with the React NodeView + the read-side renderer).
export { ALERT_VARIANTS, ALERT_VARIANT_LABEL, coerceAlertType, type AlertType } from './alertVariants.js'

/**
 * Inline content blocks — labelled, editable-in-place regions. No card, no
 * popup, no border/background: each renders a small non-editable label above an
 * editable body the author types straight into. This is the approved inline UX
 * (it replaces the earlier card + side-panel schema blocks as the defaults).
 *
 * Mechanics mirror `GridExtension` (pure `renderHTML`, no React NodeView; the
 * consumer owns the `pilotiq-*` CSS). The label is non-editable and parseHTML
 * uses `contentElement` so it never re-parses back into the node's content on
 * an HTML round-trip.
 *
 * Inserted via the slash menu (`SlashCommandExtension`, "Content" group) with
 * `insertContent` — no custom commands needed.
 */

interface LabeledBlockSpec {
  /** Node + `data-type` name (camelCase, e.g. `keyTakeaways`). */
  name: string
  /** Non-editable label shown above the body. */
  label: string
  /** Wrapper class; consumer styles `.pilotiq-block-label` + this. */
  cssClass: string
}

/** A labelled region whose body is ordinary editable content (`block+`). */
function labeledBlock(spec: LabeledBlockSpec) {
  return Node.create({
    name:     spec.name,
    group:    'block',
    content:  'block+',
    defining: true,
    parseHTML() {
      return [{ tag: `div[data-type="${spec.name}"]`, contentElement: '.pilotiq-block-body' }]
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-type': spec.name, class: spec.cssClass }),
        ['div', { class: 'pilotiq-block-label', contenteditable: 'false' }, spec.label],
        ['div', { class: 'pilotiq-block-body' }, 0],
      ]
    },
  })
}

export const KeyTakeaways = labeledBlock({ name: 'keyTakeaways', label: 'Key takeaways', cssClass: 'pilotiq-key-takeaways' })
export const Summary = labeledBlock({ name: 'summary', label: 'Summary', cssClass: 'pilotiq-summary' })

// ── FAQ — structured question / answer items ──
//
// `faq` > `faqItem+`; each item is a `faqQuestion` (inline text, "Q" marker) +
// a `faqAnswer` (block+, "A" marker). Authoring: Enter in a question jumps to
// its answer; Cmd/Ctrl-Enter inside an item adds a new Q&A item below.

const NEW_FAQ_ITEM = {
  type: 'faqItem',
  content: [{ type: 'faqQuestion' }, { type: 'faqAnswer', content: [{ type: 'paragraph' }] }],
}

export const Faq = Node.create({
  name: 'faq',
  group: 'block',
  content: 'faqItem+',
  defining: true,

  // Block width — `contained` (max-width, centered) or `full` (full bleed).
  // Generic block-layout attr; the in-block toggle lives in `FaqNodeView`.
  addAttributes() {
    return {
      width: {
        default:    'contained',
        parseHTML:  (el) => (el.getAttribute('data-width') === 'full' ? 'full' : 'contained'),
        renderHTML: (attrs) => (attrs['width'] === 'full' ? { 'data-width': 'full' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="faq"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'faq', class: 'pilotiq-faq' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FaqNodeView)
  },
  addKeyboardShortcuts() {
    return {
      // Enter drives the whole Q&A flow:
      //   • in a question → jump to its answer;
      //   • in an answer  → finish it and start a NEW Q&A item below (focus its
      //     question). Repeatable: question → Enter → answer → Enter → next.
      // (Shift-Enter still inserts a line break within an answer.)
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty) return false
        for (let d = $from.depth; d > 0; d--) {
          const name = $from.node(d).type.name
          if (name === 'faqQuestion') {
            return editor.chain().setTextSelection($from.after(d) + 1).focus().run()
          }
          if (name === 'faqAnswer') {
            const after = $from.after(d - 1) // position just after the faqItem
            return editor.chain().insertContentAt(after, NEW_FAQ_ITEM).setTextSelection(after + 2).focus().run()
          }
        }
        return false
      },
      // Cmd/Ctrl-Enter anywhere in an item also adds a new Q&A item below.
      'Mod-Enter': ({ editor }) => {
        const { $from } = editor.state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'faqItem') {
            const after = $from.after(d)
            return editor.chain().insertContentAt(after, NEW_FAQ_ITEM).setTextSelection(after + 2).focus().run()
          }
        }
        return false
      },
      // Backspace in an EMPTY question removes that whole Q&A item (and the
      // whole FAQ block if it was the only item) — like emptying a list item.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty) return false
        let qDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'faqQuestion') { qDepth = d; break }
        }
        if (qDepth === -1) return false
        if ($from.node(qDepth).content.size > 0) return false // question not empty → normal backspace
        const faqDepth = qDepth - 2
        const itemDepth = qDepth - 1
        const faq = $from.node(faqDepth)
        const faqStart = $from.before(faqDepth)
        if (faq.childCount <= 1) {
          // last item → remove the whole FAQ block
          return editor.chain().deleteRange({ from: faqStart, to: faqStart + faq.nodeSize }).focus().run()
        }
        // remove just this Q&A item; drop the cursor into a neighbouring item
        const itemStart = $from.before(itemDepth)
        const itemEnd = itemStart + $from.node(itemDepth).nodeSize
        const caret = $from.index(faqDepth) === 0 ? faqStart + 3 : itemStart - 1
        return editor.chain().deleteRange({ from: itemStart, to: itemEnd }).setTextSelection(caret).focus().run()
      },
    }
  },
})

export const FaqItem = Node.create({
  name: 'faqItem',
  group: 'faqItem',
  content: 'faqQuestion faqAnswer',
  defining: true,

  // Collapsed/expanded state — drives the editor accordion AND the read-side
  // `<details open>`; defaults open so authored content is visible.
  addAttributes() {
    return {
      open: {
        default:    true,
        parseHTML:  (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': attrs['open'] === false ? 'false' : 'true' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="faqItem"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'faqItem', class: 'pilotiq-faq-item' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FaqItemNodeView)
  },
})

export const FaqQuestion = Node.create({
  name: 'faqQuestion',
  content: 'inline*',
  defining: true,
  parseHTML() {
    // Back-compat: the pre-accordion question wrapped its text in `.pilotiq-faq-text`.
    return [
      { tag: 'div[data-type="faqQuestion"]', contentElement: '.pilotiq-faq-text' },
      { tag: 'div[data-type="faqQuestion"]' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'faqQuestion', class: 'pilotiq-faq-question' }), 0]
  },
})

export const FaqAnswer = Node.create({
  name: 'faqAnswer',
  content: 'block+',
  defining: true,
  parseHTML() {
    // Back-compat: the pre-accordion answer wrapped its body in `.pilotiq-faq-body`.
    return [
      { tag: 'div[data-type="faqAnswer"]', contentElement: '.pilotiq-faq-body' },
      { tag: 'div[data-type="faqAnswer"]' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'faqAnswer', class: 'pilotiq-faq-answer' }), 0]
  },
})

// ── Markdown round-trip — `:::alert{type=…}` container directive ──────────────
//
// The Markdown editor (`MarkdownEditor`) stores CommonMark, round-tripped via
// `tiptap-markdown`. Its parse path is HTML-based: it runs markdown-it to HTML,
// then feeds that HTML through each node's normal `parseHTML`. So Alert only
// needs (a) a markdown-it block rule that renders `:::alert{type=…}` into the
// node's `<div data-type="alert">` wire HTML — picked up by `Alert.parseHTML`
// unchanged — and (b) a serializer that emits the directive back. Generalised
// directive syntax (`:::name{attrs}`), the remark-directive convention. Kept
// dependency-free (no `markdown-it-container`) so the rich-text bundle stays
// lean and there's no CJS interop to vendor.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any
const DIRECTIVE_MARKER = 0x3a // ':'
const DIRECTIVE_MIN_MARKERS = 3

/** Parse a directive info string (`alert{type=warning}`) into an attrs map. */
export function parseDirectiveAttrs(info: string): Record<string, string> {
  const out: Record<string, string> = {}
  const m = /\{([^}]*)\}/.exec(info)
  if (!m || !m[1]) return out
  for (const pair of m[1].split(/[\s,]+/)) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** The directive name — the token before the first `{` or whitespace. */
function directiveName(info: string): string {
  return info.trim().split(/[\s{]/, 1)[0] ?? ''
}

/**
 * The directive title — the free text after `{attrs}` on the opening fence
 * line (Docusaurus-admonition style: `:::alert{type=warning} Heads up`).
 * Empty when omitted.
 */
function directiveTitle(info: string): string {
  const close = info.lastIndexOf('}')
  const rest = close === -1 ? info.replace(/^\S+/, '') : info.slice(close + 1)
  return rest.trim()
}

/** Minimal HTML escape for text interpolated into the directive's HTML. */
function escapeDirectiveHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Register the `:::alert{…}` block rule + HTML renderers on a markdown-it
 * instance. Idempotent per instance. Wired as `Alert`'s `markdown.parse.setup`.
 */
export function setupAlertDirective(md: AnyMd): void {
  if (md.__pilotiqAlertDirective) return
  md.__pilotiqAlertDirective = true

  md.block.ruler.before(
    'fence',
    'pilotiqAlert',
    (state: AnyMd, startLine: number, endLine: number, silent: boolean): boolean => {
      let pos = state.bMarks[startLine] + state.tShift[startLine]
      let max = state.eMarks[startLine]
      if (state.src.charCodeAt(pos) !== DIRECTIVE_MARKER) return false

      const memStart = pos
      while (pos <= max && state.src.charCodeAt(pos) === DIRECTIVE_MARKER) pos++
      const markerCount = pos - memStart
      if (markerCount < DIRECTIVE_MIN_MARKERS) return false

      const info = state.src.slice(pos, max).trim()
      if (directiveName(info) !== 'alert') return false
      if (silent) return true

      // Scan for the closing fence (>= as many markers, nothing but space after).
      let nextLine = startLine
      let autoClosed = false
      for (;;) {
        nextLine++
        if (nextLine >= endLine) break
        pos = state.bMarks[nextLine] + state.tShift[nextLine]
        max = state.eMarks[nextLine]
        if (state.src.charCodeAt(pos) !== DIRECTIVE_MARKER) continue
        if (state.sCount[nextLine] - state.blkIndent >= 4) continue
        let closePos = pos
        while (closePos <= max && state.src.charCodeAt(closePos) === DIRECTIVE_MARKER) closePos++
        if (closePos - pos < markerCount) continue
        if (state.src.slice(closePos, max).trim() !== '') continue
        autoClosed = true
        break
      }

      const oldParent = state.parentType
      const oldLineMax = state.lineMax
      state.parentType = 'pilotiqAlert'
      state.lineMax = nextLine

      const attrs = parseDirectiveAttrs(info)
      let token = state.push('pilotiq_alert_open', 'div', 1)
      token.markup = ':'.repeat(markerCount)
      token.block = true
      token.info = info
      token.meta = { type: attrs['type'], icon: attrs['icon'], color: attrs['color'], title: directiveTitle(info) }
      token.map = [startLine, nextLine]

      state.md.block.tokenize(state, startLine + 1, nextLine)

      token = state.push('pilotiq_alert_close', 'div', -1)
      token.markup = ':'.repeat(markerCount)
      token.block = true

      state.parentType = oldParent
      state.lineMax = oldLineMax
      state.line = nextLine + (autoClosed ? 1 : 0)
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  )

  // Open emits the alert wrapper + the (closed) title div + the OPEN body div;
  // the tokenized content renders into the body; close shuts body + wrapper.
  // The data-types match `Alert`/`AlertTitle`/`AlertBody`'s `parseHTML`, so the
  // HTML-based tiptap-markdown parse path revives the full node structure.
  md.renderer.rules['pilotiq_alert_open'] = (tokens: AnyMd[], idx: number): string => {
    const meta  = tokens[idx].meta ?? {}
    const type  = coerceAlertType(meta.type)
    const title = escapeDirectiveHtml(String(meta.title ?? ''))
    const icon  = meta.icon  ? ` data-icon="${escapeDirectiveHtml(String(meta.icon))}"`   : ''
    const color = meta.color ? ` data-color="${escapeDirectiveHtml(String(meta.color))}"` : ''
    return (
      `<div data-type="alert" class="pilotiq-alert pilotiq-alert-${type}" data-alert-type="${type}"${icon}${color}>` +
      `<div data-type="alertTitle" class="pilotiq-alert-title">${title}</div>` +
      `<div data-type="alertBody" class="pilotiq-alert-description">\n`
    )
  }
  md.renderer.rules['pilotiq_alert_close'] = (): string => '</div></div>\n'
}

/**
 * `tiptap-markdown` serializer for the Alert node → `:::alert{type=…} Title`.
 * The title rides the opening fence line (admonition style); the body markdown
 * sits between the fences.
 */
export function serializeAlertMarkdown(state: AnyMd, node: AnyMd): void {
  const type  = coerceAlertType(node.attrs?.type)
  const icon  = String(node.attrs?.icon ?? '').trim()
  const color = String(node.attrs?.color ?? '').trim()
  const title = String(node.firstChild?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const body  = node.childCount > 1 ? node.child(node.childCount - 1) : null
  // `icon` / `color` are space-free tokens (icon keys + hex), so they ride the
  // whitespace-split directive attrs cleanly.
  const attrs = [`type=${type}`]
  if (icon)  attrs.push(`icon=${icon}`)
  if (color) attrs.push(`color=${color}`)
  state.write(`:::alert{${attrs.join(' ')}}${title ? ' ' + title : ''}\n`)
  if (body) state.renderContent(body)
  state.ensureNewLine()
  state.write(':::')
  state.closeBlock(node)
}

// ── Alert — shadcn-style callout: icon + editable title + editable body ───────
//
// `alert` wraps two editable children: `alertTitle` (the heading, defaults to
// the variant label) and `alertBody` (the description). The in-editor chrome —
// icon, variant picker, theme styling — lives in the React NodeView
// (`AlertNodeView`); `renderHTML` here is the headless / clipboard / getHTML
// fallback, and `render.ts` owns the published read-side HTML. Variant lives on
// the `type` attr (info/warning/success/tip/custom); `icon` / `color` back the
// Phase-2 per-block pickers.

export const Alert = Node.create({
  name:     'alert',
  group:    'block',
  content:  'alertTitle alertBody',
  defining: true,

  // Markdown round-trip — `:::alert{type=…} Title` (only consulted when the
  // `tiptap-markdown` extension is present, i.e. the Markdown editor).
  addStorage() {
    return {
      markdown: {
        serialize: serializeAlertMarkdown,
        parse:     { setup: setupAlertDirective },
      },
    }
  },

  addAttributes() {
    return {
      type: {
        default:    'info' as AlertType,
        parseHTML:  (el) => coerceAlertType(el.getAttribute('data-alert-type')),
        renderHTML: (attrs) => ({ 'data-alert-type': coerceAlertType(attrs['type']) }),
      },
      // Block width — `contained` (default) or `full` (full bleed). Same generic
      // layout attr as the FAQ block; surfaced through the in-block gear menu.
      width: {
        default:    'contained',
        parseHTML:  (el) => (el.getAttribute('data-width') === 'full' ? 'full' : 'contained'),
        renderHTML: (attrs) => (attrs['width'] === 'full' ? { 'data-width': 'full' } : {}),
      },
      icon: {
        default:    '',
        parseHTML:  (el) => el.getAttribute('data-icon') ?? '',
        renderHTML: (attrs) => (attrs['icon'] ? { 'data-icon': String(attrs['icon']) } : {}),
      },
      // User-pasted custom SVG (sanitized). Wins over `icon` when set; not
      // carried in markdown (would bloat the source) — rich-text only.
      iconSvg: {
        default:    '',
        parseHTML:  (el) => el.getAttribute('data-icon-svg') ?? '',
        renderHTML: (attrs) => (attrs['iconSvg'] ? { 'data-icon-svg': String(attrs['iconSvg']) } : {}),
      },
      color: {
        default:    '',
        parseHTML:  (el) => el.getAttribute('data-color') ?? '',
        renderHTML: (attrs) => (attrs['color'] ? { 'data-color': String(attrs['color']) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="alert"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'alert', class: 'pilotiq-alert' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AlertNodeView)
  },
})

/** The Alert heading — a single editable line, defaults to the variant label. */
export const AlertTitle = Node.create({
  name:     'alertTitle',
  content:  'inline*',
  defining: true,
  parseHTML() {
    return [
      { tag: 'div[data-type="alertTitle"]' },
      { tag: '.pilotiq-alert-title' },
      // Back-compat: the pre-redesign alert's non-editable label.
      { tag: '[data-type="alert"] > .pilotiq-block-label' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'alertTitle', class: 'pilotiq-alert-title' }), 0]
  },
})

/** The Alert body — the editable description (`block+`). */
export const AlertBody = Node.create({
  name:     'alertBody',
  content:  'block+',
  defining: true,
  parseHTML() {
    return [
      { tag: 'div[data-type="alertBody"]' },
      { tag: '.pilotiq-alert-description' },
      // Back-compat: the pre-redesign alert's body wrapper.
      { tag: '[data-type="alert"] > .pilotiq-block-body' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'alertBody', class: 'pilotiq-alert-description' }), 0]
  },
})

// ── Pros & cons — two labelled columns (each a `block+` body, list by default) ──

export const ProsCons = Node.create({
  name:     'prosCons',
  group:    'block',
  content:  'prosColumn consColumn',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="prosCons"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'prosCons', class: 'pilotiq-pros-cons' }), 0]
  },
})

function prosConsColumn(name: string, label: string, cssClass: string) {
  return Node.create({
    name,
    group:    'prosConsColumn',
    content:  'block+',
    defining: true,
    parseHTML() {
      return [{ tag: `div[data-type="${name}"]`, contentElement: '.pilotiq-block-body' }]
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-type': name, class: cssClass }),
        ['div', { class: 'pilotiq-block-label', contenteditable: 'false' }, label],
        ['div', { class: 'pilotiq-block-body' }, 0],
      ]
    },
  })
}

export const ProsColumn = prosConsColumn('prosColumn', 'Pros', 'pilotiq-pros')
export const ConsColumn = prosConsColumn('consColumn', 'Cons', 'pilotiq-cons')

// ── Keyboard: delete a whole content block with Backspace at its start ──
//
// Custom blocks have no inline "remove" affordance, and Backspace inside a
// nested block (FAQ etc.) just deletes characters. So: Backspace at the very
// start of a content block removes the entire block — the reliable, keyboard
// way to delete one (the drag handle's click-to-select is the mouse way).

// faq is excluded — it handles Backspace itself (empty-question → remove item).
const DELETABLE_BLOCKS = new Set(['summary', 'keyTakeaways', 'alert', 'prosCons'])

export const ContentBlockKeymap = Extension.create({
  name: 'pilotiqContentBlockKeymap',
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parentOffset !== 0) return false
        for (let d = 1; d <= $from.depth; d++) {
          const node = $from.node(d)
          if (!DELETABLE_BLOCKS.has(node.type.name)) continue
          // Only when the cursor is at the block's very start (first child all
          // the way down) — otherwise let Backspace delete normally.
          let atStart = true
          for (let dd = $from.depth; dd > d; dd--) {
            if ($from.index(dd - 1) !== 0) { atStart = false; break }
          }
          if (!atStart) return false
          const start = $from.before(d)
          return editor.chain().deleteRange({ from: start, to: start + node.nodeSize }).focus().run()
        }
        return false
      },
    }
  },
})

/** All inline content-block extensions — registered in the editor's list. */
export const contentBlockNodes = [
  KeyTakeaways,
  Summary,
  Faq,
  FaqItem,
  FaqQuestion,
  FaqAnswer,
  Alert,
  AlertTitle,
  AlertBody,
  ProsCons,
  ProsColumn,
  ConsColumn,
  ContentBlockKeymap,
]
