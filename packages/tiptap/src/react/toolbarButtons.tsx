import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import type { ToolbarButtonId } from '../RichTextField.js'

/**
 * One toolbar button's behavior. The renderer wires `<button>` chrome — this
 * descriptor only knows the editor command, the active-state predicate, and
 * the icon.
 *
 * Buttons that depend on extensions registered in later phases (textColor,
 * highlight, attachFiles, table*) are registered with `available: false`
 * until that phase ships, so config that targets them today is silently
 * dropped instead of crashing.
 */
export interface ToolbarButtonDef {
  id:        ToolbarButtonId
  label:     string
  shortcut?: string
  icon:      ReactNode
  /** Phase-A buttons set this to `true`; later-phase placeholders set `false`. */
  available: boolean
  /** Whether the button reflects the editor's "currently active" state. */
  isActive?: (editor: Editor) => boolean
  /** Whether the button is disabled given the current selection. */
  isDisabled?: (editor: Editor) => boolean
  /** Run on click. */
  command:   (editor: Editor) => void
  /**
   * Optional opt-in for buttons whose behavior is "open a UI" rather than
   * fire a chain — the editor surface keeps its own state for these and the
   * default click handler doesn't run a chain.
   */
  custom?: 'link' | 'textColor' | 'highlight' | 'attachFiles'
}

const ICON_PROPS = {
  width: 14, height: 14, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': 'true' as const,
}

// Inline SVGs (lucide.dev paths). Kept inline so the package doesn't pull
// `lucide-react` as a peer dep.
const Icons = {
  bold: (
    <svg {...ICON_PROPS} strokeWidth={2.25}>
      <path d="M6 12h9a4 4 0 0 1 0 8H6Z" />
      <path d="M6 4h7a4 4 0 0 1 0 8H6Z" />
    </svg>
  ),
  italic: (
    <svg {...ICON_PROPS}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  ),
  underline: (
    <svg {...ICON_PROPS}>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
  ),
  strike: (
    <svg {...ICON_PROPS}>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  subscript: (
    <svg {...ICON_PROPS}>
      <path d="m4 5 8 10" />
      <path d="m12 5-8 10" />
      <path d="M20 21h-4c0-1.5.44-2 1.5-2.5S20 17.33 20 16c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
    </svg>
  ),
  superscript: (
    <svg {...ICON_PROPS}>
      <path d="m4 19 8-10" />
      <path d="m12 19-8-10" />
      <path d="M20 11h-4c0-1.5.44-2 1.5-2.5S20 7.33 20 6c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
    </svg>
  ),
  code: (
    <svg {...ICON_PROPS}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  paragraph: (
    <svg {...ICON_PROPS}>
      <path d="M13 4v16" />
      <path d="M17 4v16" />
      <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
    </svg>
  ),
  h1: <span className="text-xs font-semibold leading-none">H1</span>,
  h2: <span className="text-xs font-semibold leading-none">H2</span>,
  h3: <span className="text-xs font-semibold leading-none">H3</span>,
  h4: <span className="text-xs font-semibold leading-none">H4</span>,
  h5: <span className="text-xs font-semibold leading-none">H5</span>,
  h6: <span className="text-xs font-semibold leading-none">H6</span>,
  alignStart: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  ),
  alignCenter: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  ),
  alignEnd: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="6" y1="18" x2="21" y2="18" />
    </svg>
  ),
  alignJustify: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  blockquote: (
    <svg {...ICON_PROPS}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </svg>
  ),
  codeBlock: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="10 10 7 13 10 16" />
      <polyline points="14 10 17 13 14 16" />
    </svg>
  ),
  bulletList: (
    <svg {...ICON_PROPS}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  orderedList: (
    <svg {...ICON_PROPS}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  ),
  horizontalRule: (
    <svg {...ICON_PROPS}>
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  ),
  clearFormatting: (
    <svg {...ICON_PROPS}>
      <path d="M4 7V4h16v3" />
      <line x1="5" y1="20" x2="21" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  ),
  link: (
    <svg {...ICON_PROPS}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  textColor: (
    <svg {...ICON_PROPS}>
      <path d="M5 21h14" />
      <path d="m6 18 6-13 6 13" />
      <path d="M9 13h6" />
    </svg>
  ),
  highlight: (
    <svg {...ICON_PROPS}>
      <path d="m9 11-6 6v3h3l6-6" />
      <path d="M22 12 12 2l-2 2 10 10z" />
      <path d="m14 6 6 6" />
    </svg>
  ),
  attachFiles: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  table: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9"  y1="3" x2="9"  y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  tableAddColumnBefore: (
    <svg {...ICON_PROPS}>
      <rect x="11" y="3" width="10" height="18" rx="1" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="4" y1="10" x2="4" y2="14" />
    </svg>
  ),
  tableAddColumnAfter: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="10" height="18" rx="1" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  ),
  tableDeleteColumn: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9"  y1="3" x2="9"  y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
      <line x1="10" y1="9"  x2="14" y2="13" />
      <line x1="14" y1="9"  x2="10" y2="13" />
    </svg>
  ),
  tableAddRowBefore: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="11" width="18" height="10" rx="1" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="10" y1="4" x2="14" y2="4" />
    </svg>
  ),
  tableAddRowAfter: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="10" rx="1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="10" y1="20" x2="14" y2="20" />
    </svg>
  ),
  tableDeleteRow: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9"  y1="11" x2="13" y2="13" />
      <line x1="13" y1="11" x2="9"  y2="13" />
    </svg>
  ),
  tableMergeCells: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="9"  y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <line x1="12" y1="3" x2="12" y2="9" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  ),
  tableSplitCell: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3"  y1="12" x2="21" y2="12" />
      <line x1="12" y1="3"  x2="12" y2="21" />
    </svg>
  ),
  tableToggleHeaderRow: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="3" y="3" width="18" height="6"  fill="currentColor" opacity="0.25" stroke="none" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  ),
  tableToggleHeaderCell: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="3" y="3" width="9"  height="6"  fill="currentColor" opacity="0.25" stroke="none" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  ),
  tableDelete: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
      <line x1="18" y1="6"  x2="6"  y2="18" />
    </svg>
  ),
  undo: (
    <svg {...ICON_PROPS}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),
  redo: (
    <svg {...ICON_PROPS}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  ),
}

/** Lookup table for every recognized button id. */
export const TOOLBAR_BUTTONS: Record<ToolbarButtonId, ToolbarButtonDef> = {
  bold: {
    id: 'bold', label: 'Bold', shortcut: 'B', available: true, icon: Icons.bold,
    isActive: (ed) => ed.isActive('bold'),
    command: (ed) => { ed.chain().focus().toggleBold().run() },
  },
  italic: {
    id: 'italic', label: 'Italic', shortcut: 'I', available: true, icon: Icons.italic,
    isActive: (ed) => ed.isActive('italic'),
    command: (ed) => { ed.chain().focus().toggleItalic().run() },
  },
  underline: {
    id: 'underline', label: 'Underline', shortcut: 'U', available: true, icon: Icons.underline,
    isActive: (ed) => ed.isActive('underline'),
    command: (ed) => { ed.chain().focus().toggleUnderline().run() },
  },
  strike: {
    id: 'strike', label: 'Strikethrough', shortcut: '⇧X', available: true, icon: Icons.strike,
    isActive: (ed) => ed.isActive('strike'),
    command: (ed) => { ed.chain().focus().toggleStrike().run() },
  },
  subscript: {
    id: 'subscript', label: 'Subscript', shortcut: ',', available: true, icon: Icons.subscript,
    isActive: (ed) => ed.isActive('subscript'),
    command: (ed) => { ed.chain().focus().toggleSubscript().run() },
  },
  superscript: {
    id: 'superscript', label: 'Superscript', shortcut: '.', available: true, icon: Icons.superscript,
    isActive: (ed) => ed.isActive('superscript'),
    command: (ed) => { ed.chain().focus().toggleSuperscript().run() },
  },
  code: {
    id: 'code', label: 'Inline code', shortcut: 'E', available: true, icon: Icons.code,
    isActive: (ed) => ed.isActive('code'),
    command: (ed) => { ed.chain().focus().toggleCode().run() },
  },
  paragraph: {
    id: 'paragraph', label: 'Paragraph', available: true, icon: Icons.paragraph,
    isActive: (ed) => ed.isActive('paragraph'),
    command: (ed) => { ed.chain().focus().setParagraph().run() },
  },
  h1: makeHeading(1, Icons.h1),
  h2: makeHeading(2, Icons.h2),
  h3: makeHeading(3, Icons.h3),
  h4: makeHeading(4, Icons.h4),
  h5: makeHeading(5, Icons.h5),
  h6: makeHeading(6, Icons.h6),
  alignStart: makeAlign('left',    'Align left',    Icons.alignStart),
  alignCenter: makeAlign('center', 'Align center',  Icons.alignCenter),
  alignEnd: makeAlign('right',     'Align right',   Icons.alignEnd),
  alignJustify: makeAlign('justify','Justify',      Icons.alignJustify),
  blockquote: {
    id: 'blockquote', label: 'Quote', available: true, icon: Icons.blockquote,
    isActive: (ed) => ed.isActive('blockquote'),
    command: (ed) => { ed.chain().focus().toggleBlockquote().run() },
  },
  codeBlock: {
    id: 'codeBlock', label: 'Code block', available: true, icon: Icons.codeBlock,
    isActive: (ed) => ed.isActive('codeBlock'),
    command: (ed) => { ed.chain().focus().toggleCodeBlock().run() },
  },
  bulletList: {
    id: 'bulletList', label: 'Bullet list', available: true, icon: Icons.bulletList,
    isActive: (ed) => ed.isActive('bulletList'),
    command: (ed) => { ed.chain().focus().toggleBulletList().run() },
  },
  orderedList: {
    id: 'orderedList', label: 'Numbered list', available: true, icon: Icons.orderedList,
    isActive: (ed) => ed.isActive('orderedList'),
    command: (ed) => { ed.chain().focus().toggleOrderedList().run() },
  },
  horizontalRule: {
    id: 'horizontalRule', label: 'Divider', available: true, icon: Icons.horizontalRule,
    command: (ed) => { ed.chain().focus().setHorizontalRule().run() },
  },
  clearFormatting: {
    id: 'clearFormatting', label: 'Clear formatting', available: true, icon: Icons.clearFormatting,
    command: (ed) => { ed.chain().focus().clearNodes().unsetAllMarks().run() },
  },
  link: {
    id: 'link', label: 'Link', shortcut: 'K', available: true, icon: Icons.link, custom: 'link',
    isActive: (ed) => ed.isActive('link'),
    // Click-handling lives in the toolbar itself — the dialog needs React state.
    command: () => {},
  },
  undo: {
    id: 'undo', label: 'Undo', shortcut: 'Z', available: true, icon: Icons.undo,
    isDisabled: (ed) => !ed.can().undo(),
    command: (ed) => { ed.chain().focus().undo().run() },
  },
  redo: {
    id: 'redo', label: 'Redo', shortcut: '⇧Z', available: true, icon: Icons.redo,
    isDisabled: (ed) => !ed.can().redo(),
    command: (ed) => { ed.chain().focus().redo().run() },
  },
  textColor: {
    id: 'textColor', label: 'Text color', available: true, icon: Icons.textColor, custom: 'textColor',
    isActive: (ed) => Boolean(ed.getAttributes('textStyle')['color']),
    command:  () => {},
  },
  highlight: {
    id: 'highlight', label: 'Highlight', available: true, icon: Icons.highlight, custom: 'highlight',
    isActive: (ed) => ed.isActive('highlight'),
    command:  () => {},
  },
  attachFiles: {
    id: 'attachFiles', label: 'Attach files', available: true, icon: Icons.attachFiles, custom: 'attachFiles',
    // Click-handling lives in the toolbar — opens a Base UI dialog driven
    // by React state (file picker + alt text + upload progress).
    command: () => {},
  },
  // ---- Tables (Phase F). ----------------------------------------------------
  // The "insert table" button is always enabled (creates a table at the cursor);
  // every cell-action button is gated on `inTable` so the user can't run a
  // no-op command outside a table. Tiptap returns `false` from these commands
  // when the cursor is elsewhere — `can()` is the canonical check.
  table: {
    id: 'table', label: 'Insert table', available: true, icon: Icons.table,
    command: (ed) => {
      ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
  tableAddColumnBefore: {
    id: 'tableAddColumnBefore', label: 'Add column before', available: true, icon: Icons.tableAddColumnBefore,
    isDisabled: (ed) => !ed.can().addColumnBefore(),
    command:    (ed) => { ed.chain().focus().addColumnBefore().run() },
  },
  tableAddColumnAfter: {
    id: 'tableAddColumnAfter', label: 'Add column after', available: true, icon: Icons.tableAddColumnAfter,
    isDisabled: (ed) => !ed.can().addColumnAfter(),
    command:    (ed) => { ed.chain().focus().addColumnAfter().run() },
  },
  tableDeleteColumn: {
    id: 'tableDeleteColumn', label: 'Delete column', available: true, icon: Icons.tableDeleteColumn,
    isDisabled: (ed) => !ed.can().deleteColumn(),
    command:    (ed) => { ed.chain().focus().deleteColumn().run() },
  },
  tableAddRowBefore: {
    id: 'tableAddRowBefore', label: 'Add row before', available: true, icon: Icons.tableAddRowBefore,
    isDisabled: (ed) => !ed.can().addRowBefore(),
    command:    (ed) => { ed.chain().focus().addRowBefore().run() },
  },
  tableAddRowAfter: {
    id: 'tableAddRowAfter', label: 'Add row after', available: true, icon: Icons.tableAddRowAfter,
    isDisabled: (ed) => !ed.can().addRowAfter(),
    command:    (ed) => { ed.chain().focus().addRowAfter().run() },
  },
  tableDeleteRow: {
    id: 'tableDeleteRow', label: 'Delete row', available: true, icon: Icons.tableDeleteRow,
    isDisabled: (ed) => !ed.can().deleteRow(),
    command:    (ed) => { ed.chain().focus().deleteRow().run() },
  },
  tableMergeCells: {
    id: 'tableMergeCells', label: 'Merge cells', available: true, icon: Icons.tableMergeCells,
    isDisabled: (ed) => !ed.can().mergeCells(),
    command:    (ed) => { ed.chain().focus().mergeCells().run() },
  },
  tableSplitCell: {
    id: 'tableSplitCell', label: 'Split cell', available: true, icon: Icons.tableSplitCell,
    isDisabled: (ed) => !ed.can().splitCell(),
    command:    (ed) => { ed.chain().focus().splitCell().run() },
  },
  tableToggleHeaderRow: {
    id: 'tableToggleHeaderRow', label: 'Toggle header row', available: true, icon: Icons.tableToggleHeaderRow,
    isDisabled: (ed) => !ed.can().toggleHeaderRow(),
    command:    (ed) => { ed.chain().focus().toggleHeaderRow().run() },
  },
  tableToggleHeaderCell: {
    id: 'tableToggleHeaderCell', label: 'Toggle header cell', available: true, icon: Icons.tableToggleHeaderCell,
    isDisabled: (ed) => !ed.can().toggleHeaderCell(),
    isActive:   (ed) => ed.isActive('tableHeader'),
    command:    (ed) => { ed.chain().focus().toggleHeaderCell().run() },
  },
  tableDelete: {
    id: 'tableDelete', label: 'Delete table', available: true, icon: Icons.tableDelete,
    isDisabled: (ed) => !ed.can().deleteTable(),
    command:    (ed) => { ed.chain().focus().deleteTable().run() },
  },
}

function makeHeading(level: 1 | 2 | 3 | 4 | 5 | 6, icon: ReactNode): ToolbarButtonDef {
  return {
    id: `h${level}` as ToolbarButtonId,
    label: `Heading ${level}`,
    available: true,
    icon,
    isActive: (ed) => ed.isActive('heading', { level }),
    command:  (ed) => { ed.chain().focus().toggleHeading({ level }).run() },
  }
}

function makeAlign(value: 'left' | 'center' | 'right' | 'justify', label: string, icon: ReactNode): ToolbarButtonDef {
  return {
    id: `align${value === 'left' ? 'Start' : value === 'right' ? 'End' : value.charAt(0).toUpperCase() + value.slice(1)}` as ToolbarButtonId,
    label,
    available: true,
    icon,
    isActive: (ed) => ed.isActive({ textAlign: value }),
    command:  (ed) => { ed.chain().focus().setTextAlign(value).run() },
  }
}
