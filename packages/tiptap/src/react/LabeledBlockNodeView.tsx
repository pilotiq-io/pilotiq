import { type ReactElement } from 'react'
import { NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockGearShell } from './BlockGearShell.js'

/**
 * Shared React NodeView for the simple **labelled** content blocks — the ones
 * that are just a non-editable label above a `block+` body (Key takeaways,
 * Summary). They rhyme structurally, so they share ONE NodeView instead of a
 * bespoke component each; the per-block `label` + `cssClass` ride the node's
 * `addOptions()` (see `labeledBlock()` in `extensions/contentBlocks.ts`).
 *
 * The two-layer shell (full-width anchor + gear + the inner
 * `.pilotiq-block-content` that carries the max-width / centering) lives in the
 * shared `BlockGearShell`, alongside the Width gear setting. This component
 * only supplies the label + body content hole.
 */
export function LabeledBlockNodeView({ node, updateAttributes, editor, extension }: NodeViewProps): ReactElement {
  const { label, cssClass } = extension.options as { label: string; cssClass: string }

  return (
    <BlockGearShell
      node={node}
      editor={editor}
      updateAttributes={updateAttributes}
      cssClass={cssClass}
      settingsLabel={label + ' settings'}
    >
      <div className="pilotiq-block-content">
        <div className="pilotiq-block-label" contentEditable={false}>
          {label}
        </div>
        <NodeViewContent className="pilotiq-block-body" />
      </div>
    </BlockGearShell>
  )
}
