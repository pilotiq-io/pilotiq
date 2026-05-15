/**
 * Plain-text editor factory — Tiptap editor config tuned to behave like a
 * native `<input>` (single-line) or `<textarea>` (multi-line), with no marks
 * and a Document schema restricted to paragraph(s) of inline text.
 *
 * Built for `@pilotiq/pilotiq`'s collab-text-field path: when collab is on,
 * the renderer mounts a Tiptap editor instead of a native input so y-prosemirror
 * can anchor selections to Yjs `RelativePosition` items (positional identity).
 * This avoids the cursor-jump + concurrent-insert races inherent to the
 * `Y.Text` + manual `computeDelta` + heuristic `preserveCursor` path.
 *
 * Pure config — no React. Caller passes the returned object to `useEditor` or
 * `new Editor(...)`. Caller is also responsible for passing in the collab
 * extension list (typically `Collaboration` + `CollaborationCursor` from the
 * pilotiq collab adapter); we never import `@tiptap/extension-collaboration`
 * directly so the open-core package stays free of collab peer deps.
 */
import {
  Node,
  Extension,
  mergeAttributes,
  type AnyExtension,
  type EditorOptions,
  type Editor,
} from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'

/** Block separator used by `getText` — newline matches `<textarea>.value`. */
const BLOCK_SEPARATOR = '\n'

/**
 * Bare paragraph block — the only block the plain-text schema permits.
 * No options, no input rules, no toggles. `inline*` content lets any inline
 * node (today just `text`) appear inside.
 */
const PlainTextParagraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  priority: 1000,
  parseHTML() {
    return [{ tag: 'p' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0]
  },
})

/** The text node — Tiptap requires this to be defined explicitly. */
const PlainTextText = Node.create({
  name: 'text',
  group: 'inline',
})

/**
 * Build a Document node with content restricted to either a single paragraph
 * (single-line mode) or one-or-more paragraphs (multi-line mode). The schema
 * itself blocks paste of incompatible content — ProseMirror will coerce or
 * reject non-matching nodes at parse time.
 */
function makePlainTextDocument(multiline: boolean) {
  return Node.create({
    name: 'doc',
    topNode: true,
    content: multiline ? 'paragraph+' : 'paragraph',
  })
}

/**
 * Single-line Enter handler. Tiptap's default `Enter` keymap splits the
 * paragraph — meaningless when the schema only allows exactly one — so we
 * intercept and either delegate to `onSubmit` (caller-supplied) or blur.
 *
 * Filament's plain-text fields blur on Enter; matching that default.
 */
function makeSingleLineKeymap(onSubmit: ((editor: Editor) => boolean | void) | undefined) {
  return Extension.create({
    name: 'plainTextSingleLineKeymap',
    addKeyboardShortcuts() {
      const handleEnter = (): boolean => {
        const handled = onSubmit?.(this.editor)
        if (handled === true) return true
        this.editor.commands.blur()
        return true
      }
      return {
        Enter:         handleEnter,
        'Mod-Enter':   () => true,
        'Shift-Enter': () => true,
      }
    },
  })
}

export interface PlainTextEditorOptions {
  /** If true, allow multiple paragraphs (textarea-like). Default `false` (input-like). */
  multiline?: boolean
  /** Placeholder text shown while the editor is empty. */
  placeholder?: string
  /** Editable / disabled state. Default `true`. */
  editable?: boolean
  /**
   * Initial textual content. Ignored when a Collaboration extension is passed
   * via `extensions` — Collaboration takes ownership of the document and seeds
   * from the Yjs fragment instead. Use the caller's own first-load seed (see
   * `@pilotiq/tiptap` README) when collab is on.
   */
  content?: string
  /**
   * Extra extensions to merge into the editor — typically the Collaboration +
   * CollaborationCursor pair from the pilotiq collab adapter. Pass `[]` (or
   * omit) for the non-collab path.
   */
  extensions?: AnyExtension[]
  /**
   * Called on every editor update with the editor's plain-text value (blocks
   * joined by `'\n'`). Use this to mirror the value into form-state for
   * submission via a hidden `<input>`.
   */
  onUpdate?: (text: string, editor: Editor) => void
  /**
   * Single-line Enter handler. Return `true` to suppress the default blur
   * behavior. When omitted, Enter simply blurs the editor.
   */
  onSubmit?: (editor: Editor) => boolean | void
  /**
   * DOM attributes for the editor's contenteditable wrapper — typically
   * `{ class: '…tailwind classes…' }` to style the editor like the native
   * `<input>` / `<textarea>` it replaces.
   */
  editorAttributes?: Record<string, string>
}

/**
 * Read the editor's current value as plain text, with paragraphs joined by
 * `'\n'`. Mirrors the behavior of `<textarea>.value`.
 */
export function plainTextOf(editor: Editor): string {
  return editor.getText({ blockSeparator: BLOCK_SEPARATOR })
}

/**
 * Convert a plain-text string into a Tiptap JSON doc that satisfies the
 * plain-text schema. Multi-line input splits on `'\n'` into separate
 * paragraphs; single-line strips any embedded newlines into a single run.
 * Exported for tests — pure, no editor instance required.
 */
export function plainTextToDoc(text: string, multiline: boolean): {
  type: 'doc'
  content: Array<{ type: 'paragraph'; content?: Array<{ type: 'text'; text: string }> }>
} {
  if (!multiline) {
    const flat = text.replace(/\r?\n/g, '')
    return {
      type: 'doc',
      content: [
        flat ? { type: 'paragraph', content: [{ type: 'text', text: flat }] }
             : { type: 'paragraph' },
      ],
    }
  }
  const lines = text.split(/\r?\n/)
  return {
    type: 'doc',
    content: lines.map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
           : { type: 'paragraph' },
    ),
  }
}

/**
 * Build the Tiptap editor config for a plain-text field. Pass the returned
 * object to `useEditor` (React) or `new Editor(...)` (vanilla).
 *
 * The editor schema is deliberately minimal:
 *   - `doc` → `paragraph` (single-line) or `paragraph+` (multi-line)
 *   - `paragraph` → `inline*`
 *   - `text` (inline)
 *
 * No marks, no input rules, no list items, no code blocks — just text. Pasted
 * rich content is stripped to plain text by ProseMirror's schema enforcement.
 */
export function createPlainTextEditor(
  options: PlainTextEditorOptions = {},
): Partial<EditorOptions> {
  const {
    multiline = false,
    placeholder,
    editable = true,
    content = '',
    extensions = [],
    onUpdate,
    onSubmit,
    editorAttributes,
  } = options

  const schema: AnyExtension[] = [
    makePlainTextDocument(multiline),
    PlainTextParagraph,
    PlainTextText,
  ]

  const behavior: AnyExtension[] = []
  if (!multiline) behavior.push(makeSingleLineKeymap(onSubmit))
  if (placeholder !== undefined) {
    behavior.push(Placeholder.configure({ placeholder }))
  }

  const allExtensions: AnyExtension[] = [...schema, ...behavior, ...extensions]

  // When Collaboration owns the doc, an explicit `content` would race the
  // Yjs sync. Caller is responsible for omitting `content` in that case; we
  // pass it through verbatim either way.
  const initialContent = content ? plainTextToDoc(content, multiline) : ''

  const config: Partial<EditorOptions> = {
    editable,
    extensions: allExtensions,
    content: initialContent,
  }
  if (onUpdate) {
    config.onUpdate = ({ editor }) => onUpdate(plainTextOf(editor), editor)
  }
  if (editorAttributes) {
    config.editorProps = { attributes: editorAttributes }
  }
  return config
}
