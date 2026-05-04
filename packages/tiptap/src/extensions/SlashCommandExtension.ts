import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { BlockMeta } from '../Block.js'

export interface SlashItem {
  /** Stable id used to dedupe + as React key. */
  key:        string
  label:      string
  icon:       string | undefined
  group?:     string
  /** Free-text searched against label + group. */
  searchKey:  string
  /** Run when the user picks this item. `range` is the slash + query slice. */
  command:    (args: { editor: Editor; range: Range }) => void
}

/**
 * State the React side of the editor needs to render the slash menu. Set to
 * `null` when the menu should be unmounted.
 */
export interface SlashState {
  items:      SlashItem[]
  /** Pick item — Suggestion will replace the slash range and run the command. */
  command:    (item: SlashItem) => void
  /**
   * Cursor / range coords in viewport space. Re-call this every layout tick
   * (the popover positioner does) so scroll/resize tracking comes for free.
   */
  clientRect: () => DOMRect | null
  query:      string
}

export interface SlashCommandOptions {
  /** Custom blocks contributed by RichTextField.blocks([...]). */
  blocks: BlockMeta[]
  /**
   * Called whenever the menu should mount, update, or unmount. TiptapEditor
   * holds the React state and passes a setter here.
   */
  onStateChange: (state: SlashState | null) => void
}

/**
 * `/`-triggered slash menu. The plugin owns the suggestion lifecycle (range
 * detection + command invocation); rendering is React-side via a Base UI
 * Popover anchored to a virtual element. Keyboard events are NOT forwarded
 * through the Suggestion plugin — TiptapEditor installs a document-level
 * capture-phase keydown listener while the menu is open, because Base UI's
 * focus manager can briefly steal focus from the editor when the popup mounts
 * and the suggestion plugin's `handleKeyDown` only fires when the editor has
 * focus.
 */
export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      blocks:        [],
      onStateChange: () => {},
    }
  },

  addProseMirrorPlugins() {
    const blocks = this.options.blocks
    const emit   = this.options.onStateChange

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }: { query: string }) => buildItems(blocks, query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        },
        render: () => ({
          onStart:   (props) => emit(stateFrom(props)),
          onUpdate:  (props) => emit(stateFrom(props)),
          // Keys are handled at the document level by TiptapEditor; nothing
          // to do here. Returning false lets PM's keymap handle anything we
          // don't intercept (typing more of the slash query, etc.).
          onKeyDown: () => false,
          onExit:    () => emit(null),
        }),
      } satisfies SuggestionOptions<SlashItem, SlashItem>),
    ]
  },
})

function stateFrom(props: {
  items:      SlashItem[]
  command:    (item: SlashItem) => void
  clientRect?: (() => DOMRect | null) | null
  query:      string
}): SlashState {
  return {
    items:      props.items,
    command:    props.command,
    clientRect: props.clientRect ?? (() => null),
    query:      props.query,
  }
}

// Built-in items mirror the standard rich-text-editor slash menu. Custom
// blocks append.
function buildItems(blocks: BlockMeta[], query: string): SlashItem[] {
  const builtins: SlashItem[] = [
    {
      key: 'paragraph', label: 'Text', icon: '¶', group: 'Basic',
      searchKey: 'text paragraph p',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
    },
    ...[1, 2, 3, 4, 5, 6].map((level) => ({
      key:       `heading-${level}`,
      label:     `Heading ${level}`,
      icon:      `H${level}`,
      group:     'Headings',
      searchKey: `heading ${level} h${level}${level === 1 ? ' title' : level === 2 ? ' subtitle' : ''}`,
      command: ({ editor, range }: { editor: Editor; range: Range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level }).run(),
    })),
    {
      key: 'bullet-list', label: 'Bullet list', icon: '•', group: 'Lists',
      searchKey: 'bullet list ul unordered',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      key: 'ordered-list', label: 'Numbered list', icon: '1.', group: 'Lists',
      searchKey: 'numbered ordered list ol',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      key: 'quote', label: 'Quote', icon: '❝', group: 'Basic',
      searchKey: 'quote blockquote',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      key: 'code', label: 'Code block', icon: '</>', group: 'Basic',
      searchKey: 'code block pre',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      key: 'hr', label: 'Divider', icon: '—', group: 'Basic',
      searchKey: 'divider hr horizontal rule',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      key: 'align-left', label: 'Align left', icon: '⇤', group: 'Align',
      searchKey: 'align left start',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setTextAlign('left').run(),
    },
    {
      key: 'align-center', label: 'Align center', icon: '⇔', group: 'Align',
      searchKey: 'align center middle',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setTextAlign('center').run(),
    },
    {
      key: 'align-right', label: 'Align right', icon: '⇥', group: 'Align',
      searchKey: 'align right end',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setTextAlign('right').run(),
    },
    {
      key: 'clear-format', label: 'Clear formatting', icon: '⌫', group: 'Basic',
      searchKey: 'clear formatting reset',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).clearNodes().unsetAllMarks().run(),
    },
  ]

  const customs: SlashItem[] = blocks.map((b) => ({
    key:       `block:${b.name}`,
    label:     b.label,
    icon:      b.icon,
    group:     'Blocks',
    searchKey: `${b.label} ${b.name} block`,
    command: ({ editor, range }) => {
      // Use insertContent directly with explicit attrs rather than chaining
      // through our custom `insertBlock` command — chained custom commands
      // sometimes drop the `attrs` payload depending on Tiptap version.
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'pilotiqBlock',
          attrs: {
            blockType: b.name,
            blockData: defaultsFromSchema(b),
          },
        })
        .run()
    },
  }))

  const all = [...builtins, ...customs]
  if (!query) return all

  const needle = query.toLowerCase()
  return all.filter((item) =>
    `${item.label} ${item.searchKey} ${item.group ?? ''}`.toLowerCase().includes(needle),
  )
}

function defaultsFromSchema(block: BlockMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of block.schema) {
    out[f.name] = ''
  }
  return out
}
