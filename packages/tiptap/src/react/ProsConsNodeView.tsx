import { type ReactElement } from 'react'
import { NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockGearShell } from './BlockGearShell.js'

/**
 * React NodeView for the `prosCons` container — hosts the in-block **gear menu**
 * (Width) at the top-end corner. The two `prosColumn` / `consColumn` children
 * keep their plain `renderHTML` (label + body); only the container needs React,
 * for the gear. The two-layer shell (full-width anchor + gear) lives in the
 * shared `BlockGearShell`; this component only supplies the inner
 * `.pilotiq-pros-cons-content`, which carries the two-column grid + max-width /
 * centering.
 */
export function ProsConsNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  return (
    <BlockGearShell
      node={node}
      editor={editor}
      updateAttributes={updateAttributes}
      cssClass="pilotiq-pros-cons"
      settingsLabel="Pros & cons settings"
    >
      <NodeViewContent className="pilotiq-pros-cons-content" />
    </BlockGearShell>
  )
}
