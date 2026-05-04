import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeTag: {
      /** Insert a `mergeTag` atom node carrying the given identifier. */
      insertMergeTag: (id: string) => ReturnType
    }
  }
}

/**
 * Inline atom that represents a `{{ tag }}` placeholder in the document.
 *
 * The editor renders the node as a small chip — `{{ id }}` inside a styled
 * `<span>` — so the author sees what gets substituted at read time. Storage
 * is JSON: `{ type: 'mergeTag', attrs: { id: 'name' } }`.
 *
 * Read-side rendering happens through `renderRichTextToHtml(content,
 * { mergeTags: { name: 'Sleman' } })` — pass a substitution map and the
 * placeholder is replaced with the value (HTML-escaped). Without a map,
 * the renderer emits `<span class="merge-tag" data-id="name">{{ name }}</span>`
 * so previews on the server stay informative.
 */
export const MergeTagExtension = Node.create({
  name: 'mergeTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => {
          if (!attrs['id']) return {}
          return { 'data-id': String(attrs['id']) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-pilotiq-merge-tag]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = String(node.attrs['id'] ?? '')
    return [
      'span',
      mergeAttributes(
        {
          'data-pilotiq-merge-tag': '',
          class: 'pilotiq-merge-tag rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary align-baseline',
        },
        HTMLAttributes,
      ),
      `{{ ${id} }}`,
    ]
  },

  addCommands() {
    return {
      insertMergeTag:
        (id: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { id },
          }),
    }
  },
})
