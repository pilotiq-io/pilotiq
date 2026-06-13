import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockSettingsMenu, type BlockWidth, type BlockSetting } from './BlockSettingsMenu.js'

/**
 * Shared React NodeView for the simple **labelled** content blocks — the ones
 * that are just a non-editable label above a `block+` body (Key takeaways,
 * Summary). They rhyme structurally, so they share ONE NodeView instead of a
 * bespoke component each; the per-block `label` + `cssClass` ride the node's
 * `addOptions()` (see `labeledBlock()` in `extensions/contentBlocks.ts`).
 *
 * Mirrors the FAQ/Alert layout: a full-width outer anchor (`cssClass`, stays
 * put so the gear doesn't move on a width toggle) wrapping an inner
 * `.pilotiq-block-content` that carries the max-width / centering. The only
 * setting today is **Width** (contained vs full) via the in-block gear menu;
 * the `width` attr drives `data-width`, which the consumer's CSS reads (shared
 * with the read-side `render.ts`).
 */
export function LabeledBlockNodeView({ node, updateAttributes, editor, extension }: NodeViewProps): ReactElement {
  const { label, cssClass } = extension.options as { label: string; cssClass: string }
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
    <NodeViewWrapper data-type={node.type.name} data-width={width} className={cssClass + ' relative'}>
      {editor.isEditable && (
        <BlockSettingsMenu
          settings={settings}
          label={label + ' settings'}
          hoverClass={'[.' + cssClass + ':hover_&]:opacity-100'}
        />
      )}
      <div className="pilotiq-block-content">
        <div className="pilotiq-block-label" contentEditable={false}>
          {label}
        </div>
        <NodeViewContent className="pilotiq-block-body" />
      </div>
    </NodeViewWrapper>
  )
}
