import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { BlockMeta } from '../Block.js'
import { BlockNodeView } from '../react/BlockNodeView.js'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customBlock: {
      /** Insert a custom-block node by type, with optional initial data. */
      insertBlock: (blockType: string, blockData?: Record<string, unknown>) => ReturnType
    }
  }
}

export interface BlockNodeOptions {
  /**
   * Block-meta registry. The NodeView reads from this to find the schema
   * for the block-type it's rendering. Stashed on the extension's options
   * because Tiptap's ReactNodeViewRenderer mounts NodeViews in a separate
   * React tree — `useContext` does NOT reach them, so we can't pass
   * registry data via React context.
   */
  blocks: BlockMeta[]
  /**
   * Bridge from the NodeView's separate React tree back to the editor's
   * own tree, where the side panel lives. Set by `TiptapEditor` so the
   * "Edit" button on each block can request the panel open against this
   * specific node. `undefined` means no host is listening — the NodeView
   * falls back to a no-op (does not render an Edit affordance, or does
   * so disabled, depending on the consumer's chrome).
   */
  onEdit?: (pos: number) => void
}

/**
 * Single ProseMirror node type that represents every custom block. The
 * concrete block type ("callout", "image", …) lives in `attrs.blockType`,
 * and the per-block data lives in `attrs.blockData`. The React NodeView
 * looks the type up in this extension's `options.blocks` and renders the
 * matching inline form.
 *
 * Storing one node type per block name would scale O(n) extensions. This
 * approach scales O(1).
 */
export const BlockNodeExtension = Node.create<BlockNodeOptions>({
  // Avoid `name: 'block'` — ProseMirror's `block` is a schema group name,
  // and naming a node identically to a group can collide subtly with
  // schema content matching (TrailingNode threw "invalid content" on every
  // dispatch with `name: 'block'`).
  name: 'pilotiqBlock',
  group: 'block',
  // Mirrors the canonical Tiptap atom-block pattern (image / horizontalRule):
  // omit `atom`/`selectable`, set `draggable: true`, no explicit `content`.
  // Setting `atom: true` together with `group: 'block'` was making
  // StarterKit's TrailingNode plugin throw "invalid content" on every
  // dispatch — even before any block was inserted.
  draggable: true,

  addOptions() {
    // `onEdit` intentionally omitted — `exactOptionalPropertyTypes` makes
    // an explicit `undefined` non-assignable to the optional field, and
    // the host wires it via `BlockNodeExtension.configure({ onEdit })`.
    return { blocks: [] }
  },

  addAttributes() {
    return {
      blockType: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-block-type'),
        renderHTML: (attrs) => {
          if (!attrs['blockType']) return {}
          return { 'data-block-type': attrs['blockType'] }
        },
      },
      blockData: {
        // Default `null` rather than `{}` — ProseMirror compares attrs by
        // reference for some equality checks, and a fresh `{}` per node
        // create call breaks them subtly.
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-block-data')
          if (!raw) return null
          try { return JSON.parse(raw) } catch { return null }
        },
        renderHTML: (attrs) => {
          if (!attrs['blockData']) return {}
          return { 'data-block-data': JSON.stringify(attrs['blockData']) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-pilotiq-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-pilotiq-block': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockNodeView)
  },

  addCommands() {
    return {
      insertBlock: (blockType, blockData = {}) => ({ commands }) =>
        commands.insertContent({
          type: this.name,
          attrs: { blockType, blockData },
        }),
    }
  },
})
