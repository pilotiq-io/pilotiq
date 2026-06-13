import { type ReactElement } from 'react'
import { NodeViewContent, type NodeViewProps } from '@tiptap/react'

import { BlockGearShell } from './BlockGearShell.js'
import { type BlockSetting } from './BlockSettingsMenu.js'

/**
 * Shared React NodeView for the simple **labelled** content blocks — the ones
 * that are just a non-editable label above a `block+` body (Key takeaways,
 * Summary, Intro). They rhyme structurally, so they share ONE NodeView instead
 * of a bespoke component each; the per-block `label` / `cssClass` / `plain` /
 * `variant` ride the node's `addOptions()` (see `labeledBlock()` in
 * `extensions/contentBlocks.ts`).
 *
 * Three shapes, one component:
 *  - **labelled** (default) — non-editable label above the body.
 *  - **variant** (summary) — label resolved from the active `variant` attr,
 *    plus a "Type" toggle in the gear menu (e.g. Summary ↔ In summary).
 *  - **plain** (intro) — no label, no max-width wrapper: ordinary prose with a
 *    faint hover-revealed affordance so authors can still see it's a landmark.
 *    The read-side renderer emits no label for plain blocks.
 *
 * The two-layer shell (full-width anchor + gear + the inner
 * `.pilotiq-block-content` that carries the max-width / centering) lives in the
 * shared `BlockGearShell`, alongside the Width gear setting.
 */
export function LabeledBlockNodeView({ node, updateAttributes, editor, extension }: NodeViewProps): ReactElement {
  const opts = extension.options as {
    label: string
    cssClass: string
    plain: boolean
    variant: { default: string; labels: Record<string, string> } | null
  }

  // Plain (intro): render as ordinary prose. The faint affordance is editor-
  // only and hover-revealed (mirrors the gear's hover reveal in BlockGearShell).
  if (opts.plain) {
    return (
      <BlockGearShell
        node={node}
        editor={editor}
        updateAttributes={updateAttributes}
        cssClass={opts.cssClass}
        settingsLabel={opts.label + ' settings'}
      >
        {editor.isEditable && (
          <div
            contentEditable={false}
            className={
              'pointer-events-none absolute -top-2.5 left-0 text-[0.65rem] font-medium uppercase tracking-wide ' +
              'text-muted-foreground opacity-0 transition-opacity [.' + opts.cssClass + ':hover_&]:opacity-60'
            }
          >
            {opts.label}
          </div>
        )}
        <NodeViewContent className="pilotiq-block-body" />
      </BlockGearShell>
    )
  }

  const label = opts.variant
    ? (opts.variant.labels[node.attrs['variant'] as string] ?? opts.label)
    : opts.label

  // Multi-variant blocks (summary) expose a "Type" select in the gear menu.
  const extraSettings: BlockSetting[] = opts.variant
    ? [{
        kind: 'select',
        key: 'variant',
        label: 'Type',
        value: (node.attrs['variant'] as string) ?? opts.variant.default,
        options: Object.entries(opts.variant.labels).map(([value, lbl]) => ({ value, label: lbl })),
        onChange: (v) => updateAttributes({ variant: v }),
      }]
    : []

  return (
    <BlockGearShell
      node={node}
      editor={editor}
      updateAttributes={updateAttributes}
      cssClass={opts.cssClass}
      settingsLabel={label + ' settings'}
      extraSettings={extraSettings}
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
