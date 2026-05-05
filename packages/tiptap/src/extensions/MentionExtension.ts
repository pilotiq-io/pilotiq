import { Node, mergeAttributes, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { MentionItem, MentionProviderMeta } from '../MentionProvider.js'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mention: {
      /**
       * Insert a `mention` atom node. `trigger` is the character the
       * provider was registered with (`@` / `#` / …) and is rendered
       * inline together with the resolved label.
       */
      insertMention: (args: { id: string; label: string; trigger: string }) => ReturnType
    }
  }
}

/**
 * State the React side of the editor needs to render the mention popover.
 * `null` when the popover should be unmounted.
 */
export interface MentionState {
  trigger:    string
  items:      MentionItem[]
  /** Pick item — Suggestion will replace the trigger range and run the command. */
  command:    (item: MentionItem) => void
  clientRect: () => DOMRect | null
  query:      string
}

export interface MentionOptions {
  providers: MentionProviderMeta[]
  /**
   * Called whenever the popover should mount, update, or unmount. TiptapEditor
   * holds the React state and passes a setter here.
   */
  onStateChange: (state: MentionState | null) => void
  /**
   * URL the field's `tagRichTextMentionUrls` walker stamped on the wire-side
   * meta. Required for async providers (`MentionProvider.itemsUsing(fn)`);
   * unused when every provider on this field is static. The client POSTs
   * `{ field, trigger, query }` per keystroke and expects `{ ok, items }`.
   */
  mentionsUrl?: string
  /**
   * Field path the route handler uses to find the RichTextField on the
   * page. Equals `Field.name` for non-nested fields. Inside a Repeater
   * row this is the dotted form `<repeaterName>.<index>.<innerName>`;
   * inside a Builder row it's `<builderName>.<index>.data.<innerName>`.
   * The route handler parses the prefix and looks up the field against
   * the Repeater's template / each Builder block's schema.
   */
  fieldName?: string
}

/**
 * Inline atom node + a Suggestion plugin per registered provider.
 *
 * The node carries `id`, `label`, and `trigger` attributes. Storage is JSON:
 * `{ type: 'mention', attrs: { id: 'sleman', label: 'Sleman', trigger: '@' } }`.
 *
 * Each provider gets its own ProseMirror Suggestion plugin instance so users
 * can mix multiple trigger characters in the same editor (`@user`, `#room`).
 * Items are static — declared via `MentionProvider.make('@').items([...])`.
 *
 * Read-side rendering happens through `renderRichTextToHtml(content,
 * { resolveMention: (trigger, id) => latestLabel })`. Without an override
 * the cached label is used — the editor stamps it at insert time so
 * static-content snapshots stay self-contained.
 */
export const MentionExtension = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      providers:     [],
      onStateChange: () => {},
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (a) => (a['id'] ? { 'data-id': String(a['id']) } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (a) => (a['label'] ? { 'data-label': String(a['label']) } : {}),
      },
      trigger: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-trigger'),
        renderHTML: (a) => (a['trigger'] ? { 'data-trigger': String(a['trigger']) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-pilotiq-mention]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const trigger = String(node.attrs['trigger'] ?? '')
    const label   = String(node.attrs['label']   ?? node.attrs['id'] ?? '')
    return [
      'span',
      mergeAttributes(
        {
          'data-pilotiq-mention': '',
          class: 'pilotiq-mention rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 align-baseline',
        },
        HTMLAttributes,
      ),
      `${trigger}${label}`,
    ]
  },

  addCommands() {
    return {
      insertMention:
        ({ id, label, trigger }) =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name, attrs: { id, label, trigger } },
            { type: 'text', text: ' ' },
          ]),
    }
  },

  addProseMirrorPlugins() {
    const providers = this.options.providers
    const emit      = this.options.onStateChange
    const editor    = this.editor
    const url       = this.options.mentionsUrl
    const fieldName = this.options.fieldName

    return providers.map((provider) =>
      Suggestion({
        editor,
        char: provider.trigger,
        startOfLine: false,
        allowSpaces: false,
        items: provider.async
          ? async ({ query }: { query: string }): Promise<MentionItem[]> =>
              fetchAsyncMentionItems(url, fieldName, provider.trigger, query)
          : ({ query }: { query: string }) => filterMentionItems(provider.items, query),
        command: ({ editor: ed, range, props }: { editor: Editor; range: Range; props: MentionItem }) => {
          ed
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'mention',
                attrs: { id: props.id, label: props.label, trigger: provider.trigger },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        render: () => ({
          onStart:  (props) => emit(stateFrom(provider.trigger, props)),
          onUpdate: (props) => emit(stateFrom(provider.trigger, props)),
          // Keys handled at the document level by TiptapEditor — same posture
          // as the slash menu.
          onKeyDown: () => false,
          onExit:    () => emit(null),
        }),
      } satisfies SuggestionOptions<MentionItem, MentionItem>),
    )
  },
})

function stateFrom(
  trigger: string,
  props: {
    items:       MentionItem[]
    command:     (item: MentionItem) => void
    clientRect?: (() => DOMRect | null) | null
    query:       string
  },
): MentionState {
  return {
    trigger,
    items:      props.items,
    command:    props.command,
    clientRect: props.clientRect ?? (() => null),
    query:      props.query,
  }
}

function filterMentionItems(items: MentionItem[], query: string): MentionItem[] {
  if (!query) return items
  const needle = query.toLowerCase()
  return items.filter((item) =>
    `${item.label} ${item.id} ${item.group ?? ''}`.toLowerCase().includes(needle),
  )
}

/**
 * Async path — POST `{ field, trigger, query }` to the field's
 * `mentionsUrl` and return the resolved items. Returns `[]` for any
 * failure (missing URL / network error / non-200 response / malformed
 * payload) so the menu degrades to "no matches" instead of throwing
 * inside Suggestion's items pipeline.
 *
 * Suggestion handles its own debouncing; we don't need a setTimeout
 * wrapper. In-flight races aren't tracked here either — Suggestion's
 * internal sequence handling owns "newer query supersedes older one".
 */
async function fetchAsyncMentionItems(
  url:     string | undefined,
  field:   string | undefined,
  trigger: string,
  query:   string,
): Promise<MentionItem[]> {
  if (!url || !field) return []
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({ field, trigger, query }),
    })
    if (!res.ok) return []
    const json = await res.json() as { ok?: boolean; items?: unknown }
    if (!json.ok || !Array.isArray(json.items)) return []
    return json.items.filter((item): item is MentionItem =>
      item != null
      && typeof item === 'object'
      && typeof (item as Record<string, unknown>)['id'] === 'string'
      && typeof (item as Record<string, unknown>)['label'] === 'string',
    )
  } catch {
    return []
  }
}
