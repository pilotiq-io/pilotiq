import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
// tippy is CJS-shaped; with esModuleInterop the default import picks up
// the callable. Casting just lets us call it without TS choking on the
// missing `.d.ts` signature for default-import-as-function.
import tippyDefault, { type Instance as TippyInstance } from 'tippy.js'
type TippyFn = (
  targets: Element | Element[] | string,
  options?: Record<string, unknown>,
) => TippyInstance[]
const tippy = tippyDefault as unknown as TippyFn
import type { ComponentType } from 'react'
import type { BlockMeta } from '../Block.js'
import { SlashMenu, type SlashMenuRef } from '../react/SlashMenu.js'

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

export interface SlashCommandOptions {
  /** Custom blocks contributed by RichTextField.blocks([...]). */
  blocks: BlockMeta[]
}

/**
 * `/`-triggered slash menu. Wraps Tiptap's Suggestion plugin and renders
 * the options through `SlashMenu` (React component). Items are computed
 * fresh on every keystroke so the search filter stays reactive without
 * us managing state inside the plugin.
 */
export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { blocks: [] }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }: { query: string }) => buildItems(this.options.blocks, query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        },
        render: makeRender,
      } satisfies SuggestionOptions<SlashItem, SlashItem>),
    ]
  },
})

// Built-in items mirror Lexical's default slash menu. Custom blocks append.
function buildItems(blocks: BlockMeta[], query: string): SlashItem[] {
  const builtins: SlashItem[] = [
    {
      key: 'paragraph', label: 'Text', icon: '¶', group: 'Basic',
      searchKey: 'text paragraph p',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
    },
    {
      key: 'heading-1', label: 'Heading 1', icon: 'H1', group: 'Headings',
      searchKey: 'heading 1 h1 title',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      key: 'heading-2', label: 'Heading 2', icon: 'H2', group: 'Headings',
      searchKey: 'heading 2 h2 subtitle',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      key: 'heading-3', label: 'Heading 3', icon: 'H3', group: 'Headings',
      searchKey: 'heading 3 h3',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
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

// Tippy-rendered React popup. Standard Tiptap pattern.
function makeRender(): {
  onStart:        (props: any) => void
  onUpdate:       (props: any) => void
  onKeyDown:      (props: any) => boolean
  onExit:         () => void
} {
  let component: ReactRenderer<SlashMenuRef> | undefined
  let popup:     TippyInstance | undefined

  return {
    onStart: (props) => {
      component = new ReactRenderer(SlashMenu as ComponentType<any>, {
        props,
        editor: props.editor,
      })
      const rect = props.clientRect?.()
      if (!rect) return
      popup = tippy('body', {
        getReferenceClientRect: () => rect,
        appendTo: () => document.body,
        content: component.element as HTMLElement,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      })[0]
    },
    onUpdate: (props) => {
      component?.updateProps(props)
      const rect = props.clientRect?.()
      if (rect && popup) {
        popup.setProps({ getReferenceClientRect: () => rect })
      }
    },
    onKeyDown: (props) => {
      if (props.event.key === 'Escape') {
        popup?.hide()
        return true
      }
      return component?.ref?.onKeyDown(props) ?? false
    },
    onExit: () => {
      popup?.destroy()
      component?.destroy()
    },
  }
}
