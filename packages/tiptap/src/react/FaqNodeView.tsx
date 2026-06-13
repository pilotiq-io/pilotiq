import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockSettingsMenu, type BlockWidth, type BlockSetting } from './BlockSettingsMenu.js'

/**
 * React NodeView for the `faq` container — hosts the in-block **gear menu** at
 * the top-end corner (chevrons live at the start, so the end is free). For now
 * its only setting is **Width** (contained vs full); the `width` attr drives
 * `data-width`, which the consumer's `.pilotiq-faq[data-width="full"]` CSS reads
 * (shared with the read-side). The faqItems render through `<NodeViewContent>`.
 */
export function FaqNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const width: BlockWidth = node.attrs['width'] === 'full' ? 'full' : 'contained'

  const settings: BlockSetting[] = [
    {
      kind: 'select',
      key: 'width',
      label: 'Width',
      value: width,
      options: [
        { value: 'contained', label: 'Contained' },
        { value: 'full', label: 'Full width' },
      ],
      onChange: (w) => updateAttributes({ width: w }),
    },
  ]

  return (
    <NodeViewWrapper data-type="faq" data-width={width} className="pilotiq-faq relative">
      {editor.isEditable && <BlockSettingsMenu settings={settings} label="FAQ settings" />}
      <NodeViewContent className="pilotiq-faq-content" />
    </NodeViewWrapper>
  )
}
