import { useState, type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

import {
  ALERT_VARIANTS,
  ALERT_ICON_KEYS,
  buildAlertIconSvg,
  sanitizeIconSvg,
  coerceAlertType,
  type AlertType,
} from '../extensions/alertVariants.js'
import { BlockSettingsMenu, type BlockSetting } from './BlockSettingsMenu.js'

/**
 * React NodeView for the `alert` content block — a shadcn-style callout on the
 * panel's theme tokens. Icon in column one, editable title + body in column two.
 *
 * Every editable control lives behind one in-block **gear menu** (top-end gutter)
 * via `BlockSettingsMenu`: Width, Type, Icon (curated inline-SVG library + a
 * "Custom SVG" paste field — no `lucide-react`), and Color (custom variant only).
 *
 * Editable regions are the child nodes (`alertTitle` / `alertBody`) rendered
 * through the single `<NodeViewContent>` hole; the wrapper styles them via child
 * selectors so the nodes' `renderHTML` stays semantic (consumer owns the
 * read-side CSS — see `render.ts`). Custom SVG is sanitized via `sanitizeIconSvg`
 * before it's stored AND when it renders.
 */

const VARIANT_BOX: Record<AlertType, string> = {
  info:    'border-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20',
  warning: 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20',
  success: 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20',
  tip:     'border-violet-500/30 bg-violet-50/40 dark:bg-violet-950/20',
  custom:  'border-border bg-card',
}

const VARIANT_ICON_COLOR: Record<AlertType, string> = {
  info:    'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  tip:     'text-violet-600 dark:text-violet-400',
  custom:  'text-foreground',
}

const VARIANT_LABEL: Record<AlertType, string> = {
  info: 'Info', warning: 'Warning', success: 'Success', tip: 'Tip', custom: 'Custom',
}

const COLOR_SWATCHES: { value: string; label: string }[] = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#64748b', label: 'Slate' },
  { value: '#0f172a', label: 'Ink' },
]

// Renders a full <svg> string (library or sanitized custom) sized to fill.
function IconSlot({ svg, className }: { svg: string; className?: string }): ReactElement {
  return (
    <span
      className={'inline-flex shrink-0 [&>svg]:size-full ' + (className ?? '')}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function AlertNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const variant  = coerceAlertType(node.attrs['type'])
  const iconKey  = String(node.attrs['icon'] ?? '')
  const iconSvg  = String(node.attrs['iconSvg'] ?? '')
  const color    = String(node.attrs['color'] ?? '')
  const width    = node.attrs['width'] === 'full' ? 'full' : 'contained'
  const editable = editor.isEditable
  const iconFull = buildAlertIconSvg(iconKey, iconSvg, variant)
  const tinted   = variant === 'custom' && color !== ''

  const [svgMode, setSvgMode]   = useState(false)
  const [svgDraft, setSvgDraft] = useState('')
  const [svgError, setSvgError] = useState(false)

  const boxStyle = tinted
    ? {
        borderColor:     `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
      }
    : undefined

  const resetSvg = (): void => { setSvgMode(false); setSvgDraft(''); setSvgError(false) }
  const pickIcon = (key: string): void => { updateAttributes({ icon: key, iconSvg: '' }); resetSvg() }
  const applyCustomSvg = (): void => {
    const clean = sanitizeIconSvg(svgDraft)
    if (!clean) { setSvgError(true); return }
    updateAttributes({ iconSvg: clean, icon: '' })
    resetSvg()
  }

  // ── Gear-menu settings (editable mode only) ──────────────────────────────
  const iconContent = !svgMode ? (
    <div className="p-1">
      <div className="grid grid-cols-6 gap-1">
        {ALERT_ICON_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            title={key}
            aria-label={key}
            onClick={() => pickIcon(key)}
            className={
              'flex size-8 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground ' +
              (!iconSvg && key === iconKey ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')
            }
          >
            <IconSlot svg={buildAlertIconSvg(key, '', variant)} className="size-4" />
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setSvgMode(true); setSvgDraft(iconSvg); setSvgError(false) }}
          className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Custom SVG…
        </button>
        <button
          type="button"
          onClick={() => { updateAttributes({ icon: '', iconSvg: '' }); resetSvg() }}
          className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Default
        </button>
      </div>
    </div>
  ) : (
    <div className="flex w-60 flex-col gap-2 p-1">
      <textarea
        value={svgDraft}
        onChange={(e) => { setSvgDraft(e.target.value); setSvgError(false) }}
        rows={5}
        spellCheck={false}
        placeholder="<svg viewBox='0 0 24 24'>…</svg>"
        className={
          'w-full resize-y rounded border bg-background p-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
          (svgError ? 'border-destructive' : 'border-input')
        }
      />
      {svgError && <p className="text-xs text-destructive">Not a valid SVG (must start with &lt;svg&gt;).</p>}
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={() => setSvgMode(false)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          Back
        </button>
        <button type="button" onClick={applyCustomSvg} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90">
          Apply
        </button>
      </div>
    </div>
  )

  const colorContent = (
    <div className="flex w-44 flex-col gap-2 p-1">
      <div className="grid grid-cols-5 gap-1">
        {COLOR_SWATCHES.map((sw) => (
          <button
            key={sw.value}
            type="button"
            title={sw.label}
            aria-label={sw.label}
            onClick={() => updateAttributes({ color: sw.value })}
            className={
              'size-6 rounded-full border border-border/60 transition-transform hover:scale-110 ' +
              (color === sw.value ? 'ring-2 ring-ring ring-offset-1 ring-offset-popover' : '')
            }
            style={{ background: sw.value }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <label className="flex flex-1 cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#3b82f6'}
            onChange={(e) => updateAttributes({ color: e.target.value })}
            className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          Custom…
        </label>
        <button
          type="button"
          onClick={() => updateAttributes({ color: '' })}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          No color
        </button>
      </div>
    </div>
  )

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
      onChange: (v) => updateAttributes({ width: v }),
    },
    {
      kind: 'select',
      key: 'type',
      label: 'Type',
      value: variant,
      options: ALERT_VARIANTS.map((v) => ({
        value: v,
        label: VARIANT_LABEL[v],
        icon: <span className={VARIANT_ICON_COLOR[v]}><IconSlot svg={buildAlertIconSvg('', '', v)} className="size-4" /></span>,
      })),
      onChange: (v) => updateAttributes({ type: v }),
    },
    {
      kind: 'custom',
      key: 'icon',
      label: 'Icon',
      hint: <span className={tinted ? '' : VARIANT_ICON_COLOR[variant]} style={tinted ? { color } : undefined}><IconSlot svg={iconFull} className="size-4" /></span>,
      content: iconContent,
    },
    ...(variant === 'custom'
      ? [{
          kind: 'custom' as const,
          key: 'color',
          label: 'Color',
          hint: <span className="size-3.5 rounded-full border border-border/60" style={{ background: color || 'var(--color-muted-foreground)' }} />,
          content: colorContent,
        }]
      : []),
  ]

  // Two layers (mirrors the FAQ block): the outer `.pilotiq-alert` stays full
  // width and is the stable anchor for the gear menu; the inner
  // `.pilotiq-alert-box` carries the visual box + the contained/full width, so
  // toggling width never shifts the gear.
  return (
    <NodeViewWrapper
      data-type="alert"
      data-alert-type={variant}
      data-width={width}
      className="pilotiq-alert relative my-3"
    >
      {editable && (
        <BlockSettingsMenu
          settings={settings}
          label="Alert settings"
          hoverClass="[.pilotiq-alert:hover_&]:opacity-100"
        />
      )}

      <div
        role="note"
        style={boxStyle}
        className={
          'pilotiq-alert-box grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm ' +
          '[&_.pilotiq-alert-title]:font-medium [&_.pilotiq-alert-title]:leading-tight ' +
          '[&_.pilotiq-alert-description]:text-muted-foreground [&_.pilotiq-alert-description_p]:my-0 ' +
          VARIANT_BOX[variant]
        }
      >
        {/* Icon (column 1) — static; changed through the gear menu. */}
        <div
          contentEditable={false}
          className={'mt-0.5 ' + (tinted ? '' : VARIANT_ICON_COLOR[variant])}
          style={tinted ? { color } : undefined}
        >
          <IconSlot svg={iconFull} className="h-4 w-4" />
        </div>

        <NodeViewContent className="col-start-2 min-w-0" />
      </div>
    </NodeViewWrapper>
  )
}
