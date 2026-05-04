import { useEffect } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { BlockMeta } from '../Block.js'

/**
 * Generic React NodeView for the `pilotiqBlock` ProseMirror node. Reads
 * the block type from `node.attrs.blockType`, looks up its `BlockMeta`
 * in `BlockNodeExtension.options.blocks`, and renders a compact inline
 * summary card with an "Edit" button.
 *
 * Editing happens in a side panel hosted by `TiptapEditor`, NOT inline.
 * The NodeView fires `BlockNodeExtension.options.onEdit(getPos())` when
 * the Edit button is clicked; the host opens its panel anchored to the
 * editor wrapper. NodeViews live in a separate React tree from the host
 * editor, so the bridge has to go through extension options — context
 * doesn't cross trees.
 *
 * If no `onEdit` is wired (e.g. a consumer that uses `BlockNodeExtension`
 * standalone without `TiptapEditor`'s panel), the Edit button is hidden.
 */
export function BlockNodeView(props: NodeViewProps) {
  const { editor, node, getPos, deleteNode } = props
  const blockType = String(node.attrs['blockType'] ?? '')
  const blockData = (node.attrs['blockData'] as Record<string, unknown> | undefined) ?? {}

  // Tiptap mounts NodeViews in a separate React tree, so we can't read the
  // block registry through context. Pull it off the extension's options
  // instead — set by RichTextField via BlockNodeExtension.configure({ blocks }).
  const blockExt = editor.extensionManager.extensions.find((e) => e.name === 'pilotiqBlock')
  const blocks   = (blockExt?.options['blocks'] as BlockMeta[] | undefined) ?? []
  const onEdit   = blockExt?.options['onEdit'] as ((pos: number) => void) | undefined
  const meta     = blocks.find((b) => b.name === blockType)

  // Self-heal: a block with no `blockType` is malformed — almost always
  // means a stale node from a prior buggy insert. Delete it on mount so
  // the editor doesn't get stuck in an unrecoverable state.
  useEffect(() => {
    if (blockType === '') deleteNode()
  }, [blockType, deleteNode])

  if (!meta) {
    if (blockType === '') return null
    return (
      <NodeViewWrapper className="my-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        Unknown block type: <code>{blockType}</code>
      </NodeViewWrapper>
    )
  }

  const summary = meta.schema
    .map((f) => {
      const v = blockData[f.name]
      return typeof v === 'string' && v ? v : ''
    })
    .filter(Boolean)
    .join(' · ') || meta.label

  const handleEdit = (): void => {
    if (!onEdit) return
    const pos = getPos()
    if (typeof pos !== 'number') return
    onEdit(pos)
  }

  return (
    <NodeViewWrapper className="pilotiq-block my-3 rounded-lg border bg-muted/30">
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={handleEdit}
          disabled={!onEdit}
          className="flex items-center gap-2 text-left text-sm disabled:cursor-default"
        >
          {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
          <span className="font-medium">{meta.label}</span>
          <span className="text-xs text-muted-foreground line-clamp-1">{summary}</span>
        </button>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteNode()}
            className="text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
