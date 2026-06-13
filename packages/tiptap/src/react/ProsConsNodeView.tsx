import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockSettingsMenu, type BlockWidth, type BlockSetting } from './BlockSettingsMenu.js'

/**
 * React NodeView for the `prosCons` container — hosts the in-block **gear menu**
 * (Width) at the top-end corner. The two `prosColumn` / `consColumn` children
 * keep their plain `renderHTML` (label + body); only the container needs React,
 * for the gear. Two layers like FAQ/Alert: a full-width outer anchor
 * (`.pilotiq-pros-cons`, stable so the gear doesn't move on a width toggle)
 * wrapping the inner `.pilotiq-pros-cons-content`, which carries the two-column
 * grid + max-width / centering. The `width` attr drives `data-width` (read by
 * the consumer CSS, shared with the read-side renderer).
 */
export function ProsConsNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
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
    <NodeViewWrapper data-type="prosCons" data-width={width} className="pilotiq-pros-cons relative">
      {editor.isEditable && (
        <BlockSettingsMenu
          settings={settings}
          label="Pros & cons settings"
          hoverClass="[.pilotiq-pros-cons:hover_&]:opacity-100"
        />
      )}
      <NodeViewContent className="pilotiq-pros-cons-content" />
    </NodeViewWrapper>
  )
}
