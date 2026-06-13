import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

const SLASH_PLUGIN_KEY = new PluginKey('pilotiqSlashSuggestion')
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
  /** Merge-tag identifiers contributed by RichTextField.mergeTags([...]). */
  mergeTags: string[]
  /**
   * Called whenever the menu should mount, update, or unmount. TiptapEditor
   * holds the React state and passes a setter here.
   */
  onStateChange: (state: SlashState | null) => void
  /**
   * `true` when the panel has wired an `UploadAdapter` (mirrors the
   * toolbar's `attachFiles` gating). Drives whether the "Image" entry
   * appears in the menu — it would have nowhere to upload otherwise.
   */
  hasUpload: boolean
  /**
   * Called when the user picks the "Image" slash entry. The slash range
   * is already deleted before this fires; the callback just opens the
   * shared attach-files dialog (whose UI lives in `Toolbar`).
   */
  onInsertImage: () => void
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
      mergeTags:     [],
      onStateChange: () => {},
      hasUpload:     false,
      onInsertImage: () => {},
    }
  },

  addProseMirrorPlugins() {
    const blocks        = this.options.blocks
    const mergeTags     = this.options.mergeTags
    const emit          = this.options.onStateChange
    const hasUpload     = this.options.hasUpload
    const onInsertImage = this.options.onInsertImage

    return [
      Suggestion({
        pluginKey: SLASH_PLUGIN_KEY,
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }: { query: string }) => buildSlashItems(blocks, mergeTags, query, { hasUpload, onInsertImage }),
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

export interface SlashInsertEntries {
  hasUpload:     boolean
  onInsertImage: () => void
}

// Built-in items mirror the standard rich-text-editor slash menu. Custom
// blocks append, then merge-tag placeholders.
//
// Exported so tests can pin down the menu contents without spinning up an
// editor instance — the function is pure and deterministic given its
// inputs.
export function buildSlashItems(
  blocks:    BlockMeta[],
  mergeTags: string[],
  query:     string,
  insert:    SlashInsertEntries,
): SlashItem[] {
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
    // 3×3 table with a header row — same shape as the toolbar `table` button.
    // No upload gate; tables are pure schema, available everywhere.
    {
      key: 'table', label: 'Table', icon: '⊞', group: 'Insert',
      searchKey: 'table grid rows columns',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    // Collapsible `<details>` block. `setDetails` wraps the cursor's
    // paragraph in a details node with an empty summary; the user starts
    // typing the summary and presses Enter to drop into the body. No
    // upload gate — pure schema, available everywhere.
    {
      key: 'details', label: 'Collapsible block', icon: '▸', group: 'Insert',
      searchKey: 'details collapsible disclosure summary toggle expand',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setDetails().run(),
    },
    // Multi-column grid layout. Two distinct entries (2-col + 3-col) so
    // the user picks the column count from the slash menu directly,
    // matching how the toolbar's `grid` button defaults to 2 cols.
    {
      key: 'grid-2', label: 'Two-column grid', icon: '⊞', group: 'Insert',
      searchKey: 'grid columns layout 2 two split side',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setGrid({ columns: 2 }).run(),
    },
    {
      key: 'grid-3', label: 'Three-column grid', icon: '⊞', group: 'Insert',
      searchKey: 'grid columns layout 3 three split',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setGrid({ columns: 3 }).run(),
    },
    // Inline content blocks — labelled, editable-in-place regions (nodes in
    // contentBlocks.ts). Inserted via insertContent; no custom commands.
    {
      key: 'key-takeaways', label: 'Key takeaways', icon: '🔑', group: 'Content',
      searchKey: 'key takeaways points highlights tldr',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'keyTakeaways',
          content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }],
        }).run(),
    },
    {
      key: 'summary', label: 'Summary', icon: '📝', group: 'Content',
      searchKey: 'summary tldr abstract overview',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({ type: 'summary', content: [{ type: 'paragraph' }] }).run(),
    },
    {
      key: 'faq', label: 'FAQ', icon: '❓', group: 'Content',
      searchKey: 'faq questions answers frequently asked',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'faq',
          content: [
            {
              type: 'faqItem',
              content: [{ type: 'faqQuestion' }, { type: 'faqAnswer', content: [{ type: 'paragraph' }] }],
            },
          ],
        }).run()
        // insertContent leaves the cursor in the answer — move it into the first
        // question. Resolve the enclosing faqItem and select its question start
        // (before(faqItem) +1 into the item +1 into the question = +2).
        const { $from } = editor.state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'faqItem') {
            editor.chain().setTextSelection($from.before(d) + 2).focus().run()
            break
          }
        }
      },
    },
    {
      key: 'pros-cons', label: 'Pros & cons', icon: '⚖️', group: 'Content',
      searchKey: 'pros cons advantages disadvantages comparison',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'prosCons',
          content: [
            { type: 'prosColumn', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] },
            { type: 'consColumn', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] },
          ],
        }).run(),
    },
    {
      // One Alert block — the variant (info/warning/success/tip/custom) is
      // switched in-block via the NodeView's picker. Defaults to Info with the
      // label pre-filled as the editable title.
      key: 'alert', label: 'Alert', icon: '⚠️', group: 'Content',
      searchKey: 'alert callout notice info warning success tip note custom caution danger hint',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type:    'alert',
          attrs:   { type: 'info' },
          content: [
            { type: 'alertTitle', content: [{ type: 'text', text: 'Info' }] },
            { type: 'alertBody',  content: [{ type: 'paragraph' }] },
          ],
        }).run(),
    },
    // Image entry shares the toolbar's attach-files dialog; only surfaced
    // when the panel has wired an `UploadAdapter`. Without one, the dialog
    // would post to a missing endpoint — the slash item degrades the same
    // way the toolbar's `attachFiles` button does (server-stripped at meta
    // build time when no adapter is set).
    ...(insert.hasUpload ? [{
      key: 'image', label: 'Image', icon: '🖼', group: 'Insert',
      searchKey: 'image upload media file attach',
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        // Drop the slash range first so the user doesn't return to a
        // dangling `/image` after closing the dialog. Inserting the
        // actual image happens inside the dialog's upload handler.
        editor.chain().focus().deleteRange(range).run()
        insert.onInsertImage()
      },
    }] satisfies SlashItem[] : []),
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
    // Inline-mark size variants. Slash-menu form leaves the slash range in
    // place rather than swallowing it, so the user runs the command on the
    // word they were just typing — the alternative ("/lead" deletes the
    // range, then user types more) requires re-positioning the cursor and
    // breaks the "type-toggle-keep-typing" rhythm authors use most.
    {
      key: 'lead', label: 'Lead', icon: 'P+', group: 'Style',
      searchKey: 'lead lede intro paragraph emphasis',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleMark('lead').run(),
    },
    {
      key: 'small', label: 'Small', icon: 'P-', group: 'Style',
      searchKey: 'small fine print footnote caption',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleMark('small').run(),
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

  const merges: SlashItem[] = mergeTags.map((id) => ({
    key:       `merge-tag:${id}`,
    label:     `{{ ${id} }}`,
    icon:      '{{}}',
    group:     'Merge tags',
    searchKey: `merge tag placeholder ${id}`,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mergeTag', attrs: { id } })
        .run()
    },
  }))

  const all = [...builtins, ...customs, ...merges]
  if (!query) return all

  const needle = query.toLowerCase()
  // Membership is unchanged from a plain substring match (an item shows iff the
  // query appears anywhere in its label / searchKey / group). On top of that we
  // RANK by relevance so a query that hits an item's LABEL beats one that only
  // mentions the word in some other item's searchKey — otherwise "/summary"
  // surfaces "Collapsible block" first (its searchKey lists "summary") instead
  // of the Summary block. Stable: equal scores keep their original menu order.
  return all
    .map((item, i) => ({ item, i, score: slashRelevance(item, needle) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((m) => m.item)
}

/**
 * Score a slash item against the lowercased query. Higher = more relevant.
 * Returns 0 when nothing matches (the item is filtered out). The tiers mirror
 * how people expect a command palette to rank: an exact/prefix LABEL hit wins,
 * then any label word, then label substring, then searchKey words, then a bare
 * searchKey/group substring. `needle` is assumed already lowercased.
 */
function slashRelevance(item: SlashItem, needle: string): number {
  const label = item.label.toLowerCase()
  const labelWords = label.split(/\s+/).filter(Boolean)
  if (label === needle) return 7
  if (label.startsWith(needle)) return 6
  if (labelWords.some((w) => w.startsWith(needle))) return 5
  if (label.includes(needle)) return 4

  const searchWords = item.searchKey.toLowerCase().split(/\s+/).filter(Boolean)
  if (searchWords.some((w) => w === needle)) return 3
  if (searchWords.some((w) => w.startsWith(needle))) return 2

  // Matched only via a searchKey / group substring (no word boundary) — still
  // shown, but ranked below every label and word-boundary hit.
  if (`${item.searchKey} ${item.group ?? ''}`.toLowerCase().includes(needle)) return 1
  return 0
}

function defaultsFromSchema(block: BlockMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of block.schema) {
    out[f.name] = ''
  }
  return out
}
