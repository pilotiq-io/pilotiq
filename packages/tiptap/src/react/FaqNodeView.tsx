import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockWidthControl, type BlockWidth } from './BlockWidthControl.js'

/**
 * React NodeView for the `faq` container — hosts the in-block **width** toggle
 * (contained vs full) at the top-end corner (the chevrons live at the start, so
 * the end is free). The `width` attr drives `data-width`, which the consumer's
 * `.pilotiq-faq[data-width="full"]` CSS reads (shared with the read-side). The
 * faqItems render through `<NodeViewContent>`.
 */
export function FaqNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const width: BlockWidth = node.attrs['width'] === 'full' ? 'full' : 'contained'

  return (
    <NodeViewWrapper data-type="faq" data-width={width} className="pilotiq-faq relative">
      {editor.isEditable && (
        <BlockWidthControl width={width} onChange={(w) => updateAttributes({ width: w })} />
      )}
      <NodeViewContent className="pilotiq-faq-content" />
    </NodeViewWrapper>
  )
}
