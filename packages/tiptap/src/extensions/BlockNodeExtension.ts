import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { BlockMeta } from '../Block.js'
import { BlockNodeView } from '../react/BlockNodeView.js'
import { serializeBlockData } from '../react/blockValues.js'

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
        // Stored as a JSON STRING, not an object. The node is a contentless
        // leaf whose whole state is this attr; under realtime collab it syncs
        // through y-prosemirror, whose PM↔Yjs attribute sync is string-oriented
        // — an object-valued attr doesn't round-trip and the node drops on edit
        // (issue #96). A primitive string syncs cleanly. The NodeView + render
        // parse it back to an object at their boundaries (`parseBlockData`),
        // which still tolerates the legacy object form for old docs.
        default: '{}',
        // `data-block-data` already holds the JSON string — pass it through
        // verbatim (no parse/re-stringify, which would double-encode).
        parseHTML: (el) => el.getAttribute('data-block-data') || '{}',
        renderHTML: (attrs) => {
          const raw = attrs['blockData']
          if (!raw || raw === '{}') return {}
          // String is the canonical form; tolerate a legacy object attr.
          return { 'data-block-data': typeof raw === 'string' ? raw : JSON.stringify(raw) }
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
          // Store as a JSON string so the attr syncs under collab (issue #96).
          attrs: { blockType, blockData: serializeBlockData(blockData) },
        }),
    }
  },
})
