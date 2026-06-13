import { type ReactNode, type ReactElement } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

import { BlockSettingsMenu, type BlockWidth, type BlockSetting } from './BlockSettingsMenu.js'

/**
 * Shared chrome for the width-aware content blocks (labelled blocks + Pros &
 * cons). Every one of them renders the same two-layer shell — a full-width
 * outer anchor (`cssClass`, stable so the gear doesn't jump on a width toggle)
 * hosting the in-block **gear menu**, with the block's own content as
 * `children`. This component owns the parts that are byte-identical across
 * those blocks so they can't drift:
 *
 *  - read the `width` attr → `data-width`,
 *  - build the **Width** setting (contained / full) for the gear,
 *  - render the `NodeViewWrapper` + the hover-revealed `BlockSettingsMenu`
 *    (editor-only), deriving the hover selector from `cssClass`.
 *
 * The caller supplies only what actually varies: the anchor `cssClass`, the
 * gear's accessible `settingsLabel`, the inner content, and (optionally) any
 * block-specific settings to show alongside Width.
 *
 * `data-type` always mirrors the node's own type name — every block that uses
 * this shell wants exactly that.
 */
export interface BlockGearShellProps {
  node: NodeViewProps['node']
  editor: NodeViewProps['editor']
  updateAttributes: NodeViewProps['updateAttributes']
  /** Outer anchor class — also drives the gear's hover-reveal selector. */
  cssClass: string
  /** Accessible label for the gear trigger, e.g. `"Summary settings"`. */
  settingsLabel: string
  /** Block-specific settings shown after Width (none today; future-proofing). */
  extraSettings?: BlockSetting[]
  children: ReactNode
}

export function BlockGearShell({
  node,
  editor,
  updateAttributes,
  cssClass,
  settingsLabel,
  extraSettings,
  children,
}: BlockGearShellProps): ReactElement {
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
    ...(extraSettings ?? []),
  ]

  return (
    <NodeViewWrapper data-type={node.type.name} data-width={width} className={cssClass + ' relative'}>
      {editor.isEditable && (
        <BlockSettingsMenu
          settings={settings}
          label={settingsLabel}
          hoverClass={'[.' + cssClass + ':hover_&]:opacity-100'}
        />
      )}
      {children}
    </NodeViewWrapper>
  )
}
