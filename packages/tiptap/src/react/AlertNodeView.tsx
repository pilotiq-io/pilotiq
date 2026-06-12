import { useState, type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { Popover } from '@base-ui/react/popover'

import {
  ALERT_VARIANTS,
  ALERT_ICON_KEYS,
  buildAlertIconSvg,
  sanitizeIconSvg,
  coerceAlertType,
  type AlertType,
} from '../extensions/alertVariants.js'
import { Palette } from './Palette.js'
import type { ColorSwatch } from '../RichTextField.js'

/**
 * React NodeView for the `alert` content block — a shadcn-style callout on the
 * panel's theme tokens. Icon in column one, editable title + body in column
 * two. Editable mode adds in-block controls (top-right): a variant picker, an
 * icon picker (curated inline-SVG library + a "Custom SVG" paste field — no
 * `lucide-react`), and a color swatch for the `custom` variant.
 *
 * Editable regions are the child nodes (`alertTitle` / `alertBody`) rendered
 * through the single `<NodeViewContent>` hole; the wrapper styles them via
 * child selectors so the nodes' `renderHTML` stays semantic (consumer owns the
 * read-side CSS — see `render.ts`). Custom SVG is sanitized via
 * `sanitizeIconSvg` before it's stored AND when it renders.
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

const COLOR_SWATCHES: ColorSwatch[] = [
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

const chevron = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
)

const ctrlBtn =
  'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-opacity ' +
  'hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 opacity-0 [.pilotiq-alert:hover_&]:opacity-100'

export function AlertNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const variant  = coerceAlertType(node.attrs['type'])
  const iconKey  = String(node.attrs['icon'] ?? '')
  const iconSvg  = String(node.attrs['iconSvg'] ?? '')
  const color    = String(node.attrs['color'] ?? '')
  const editable = editor.isEditable
  const iconFull = buildAlertIconSvg(iconKey, iconSvg, variant)
  const tinted   = variant === 'custom' && color !== ''

  const [iconOpen, setIconOpen] = useState(false)
  const [svgMode, setSvgMode]   = useState(false)
  const [svgDraft, setSvgDraft] = useState('')
  const [svgError, setSvgError] = useState(false)

  const boxStyle = tinted
    ? {
        borderColor:     `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
      }
    : undefined

  const closeIconPicker = (): void => { setIconOpen(false); setSvgMode(false); setSvgDraft(''); setSvgError(false) }
  const pickIcon = (key: string): void => { updateAttributes({ icon: key, iconSvg: '' }); closeIconPicker() }
  const applyCustomSvg = (): void => {
    const clean = sanitizeIconSvg(svgDraft)
    if (!clean) { setSvgError(true); return }
    updateAttributes({ iconSvg: clean, icon: '' })
    closeIconPicker()
  }

  return (
    <NodeViewWrapper
      data-type="alert"
      data-alert-type={variant}
      style={boxStyle}
      className={
        'pilotiq-alert relative my-3 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm ' +
        '[&_.pilotiq-alert-title]:font-medium [&_.pilotiq-alert-title]:leading-tight ' +
        '[&_.pilotiq-alert-description]:text-muted-foreground [&_.pilotiq-alert-description_p]:my-0 ' +
        VARIANT_BOX[variant]
      }
    >
      {/* Icon (column 1) — a picker trigger in editable mode, static otherwise. */}
      {editable ? (
        <Popover.Root open={iconOpen} onOpenChange={(o) => (o ? setIconOpen(true) : closeIconPicker())}>
          <Popover.Trigger
            render={
              <button
                type="button"
                contentEditable={false}
                aria-label="Alert icon"
                className={'mt-0.5 rounded hover:bg-accent ' + (tinted ? '' : VARIANT_ICON_COLOR[variant])}
                style={tinted ? { color } : undefined}
              >
                <IconSlot svg={iconFull} className="h-4 w-4" />
              </button>
            }
          />
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
              <Popover.Popup className="w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-hidden">
                {!svgMode ? (
                  <>
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
                          <IconSlot svg={buildAlertIconSvg(key, '', variant)} className="h-4 w-4" />
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
                        onClick={() => { updateAttributes({ icon: '', iconSvg: '' }); closeIconPicker() }}
                        className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        Default
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
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
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <div contentEditable={false} className={'mt-0.5 ' + (tinted ? '' : VARIANT_ICON_COLOR[variant])} style={tinted ? { color } : undefined}>
          <IconSlot svg={iconFull} className="h-4 w-4" />
        </div>
      )}

      {/* Top-right controls — color (custom only) + variant picker. */}
      {editable && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1" contentEditable={false}>
          {variant === 'custom' && (
            <Palette
              trigger={
                <button type="button" aria-label="Alert color" className={ctrlBtn}>
                  <span className="size-3 rounded-full border border-border/60" style={{ background: color || 'var(--color-muted-foreground)' }} />
                </button>
              }
              swatches={COLOR_SWATCHES}
              custom
              activeColor={color || undefined}
              onPick={(value) => updateAttributes({ color: value })}
              onClear={() => updateAttributes({ color: '' })}
              clearLabel="No color"
            />
          )}

          <Popover.Root>
            <Popover.Trigger
              render={
                <button type="button" aria-label="Alert variant" className={ctrlBtn}>
                  {VARIANT_LABEL[variant]}
                  {chevron}
                </button>
              }
            />
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
                <Popover.Popup className="min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden">
                  {ALERT_VARIANTS.map((v) => (
                    <Popover.Close
                      key={v}
                      render={
                        <button
                          type="button"
                          onClick={() => updateAttributes({ type: v })}
                          className={
                            'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground ' +
                            (v === variant ? 'bg-accent/50' : '')
                          }
                        >
                          <span className={VARIANT_ICON_COLOR[v]}><IconSlot svg={buildAlertIconSvg('', '', v)} className="h-3.5 w-3.5" /></span>
                          {VARIANT_LABEL[v]}
                        </button>
                      }
                    />
                  ))}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}

      <NodeViewContent className="col-start-2 min-w-0" />
    </NodeViewWrapper>
  )
}
