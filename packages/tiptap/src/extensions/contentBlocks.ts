import { Node, Extension, mergeAttributes } from '@tiptap/core'

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
  parseHTML() {
    return [{ tag: 'div[data-type="faq"]', contentElement: '.pilotiq-block-body' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'faq', class: 'pilotiq-faq' }),
      ['div', { class: 'pilotiq-block-label', contenteditable: 'false' }, 'FAQ'],
      ['div', { class: 'pilotiq-block-body' }, 0],
    ]
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
  parseHTML() {
    return [{ tag: 'div[data-type="faqItem"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'faqItem', class: 'pilotiq-faq-item' }), 0]
  },
})

export const FaqQuestion = Node.create({
  name: 'faqQuestion',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="faqQuestion"]', contentElement: '.pilotiq-faq-text' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'faqQuestion', class: 'pilotiq-faq-question' }),
      ['span', { class: 'pilotiq-faq-marker', contenteditable: 'false' }, 'Q'],
      ['span', { class: 'pilotiq-faq-text' }, 0],
    ]
  },
})

export const FaqAnswer = Node.create({
  name: 'faqAnswer',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="faqAnswer"]', contentElement: '.pilotiq-faq-body' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'faqAnswer', class: 'pilotiq-faq-answer' }),
      ['span', { class: 'pilotiq-faq-marker', contenteditable: 'false' }, 'A'],
      ['div', { class: 'pilotiq-faq-body' }, 0],
    ]
  },
})

// ── Alert — a typed notice; the label IS the type (Info/Warning/Success/Tip) ──

export const ALERT_TYPES = ['info', 'warning', 'success', 'tip'] as const
export type AlertType = (typeof ALERT_TYPES)[number]
const ALERT_LABEL: Record<AlertType, string> = { info: 'Info', warning: 'Warning', success: 'Success', tip: 'Tip' }

/** Exported so `render.ts` shares the same coercion at the server boundary. */
export function coerceAlertType(value: unknown): AlertType {
  return (ALERT_TYPES as readonly string[]).includes(String(value)) ? (value as AlertType) : 'info'
}

export const Alert = Node.create({
  name:     'alert',
  group:    'block',
  content:  'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default:    'info' as AlertType,
        parseHTML:  (el) => coerceAlertType(el.getAttribute('data-alert-type')),
        renderHTML: (attrs) => ({ 'data-alert-type': coerceAlertType(attrs['type']) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="alert"]', contentElement: '.pilotiq-block-body' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = coerceAlertType(node.attrs['type'])
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'alert', class: `pilotiq-alert pilotiq-alert-${type}` }),
      ['div', { class: 'pilotiq-block-label', contenteditable: 'false' }, ALERT_LABEL[type]],
      ['div', { class: 'pilotiq-block-body' }, 0],
    ]
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
  ProsCons,
  ProsColumn,
  ConsColumn,
  ContentBlockKeymap,
]
