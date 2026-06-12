import { type ReactElement } from 'react'
import { Popover } from '@base-ui/react/popover'

/**
 * Reusable in-block **width** toggle — `contained` (max-width, centered) vs
 * `full` (full bleed). Sits outset in the inline-end gutter (mirroring the
 * drag handle on the start side), above the content with a z-index so the
 * trigger is clickable (the block's own content would otherwise capture the
 * click). The caller owns the `width` attr + the matching `data-width` / CSS.
 */
export type BlockWidth = 'contained' | 'full'

const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 'contained', label: 'Contained' },
  { value: 'full', label: 'Full width' },
]

export function BlockWidthControl(
  { width, onChange, hoverClass = '[.pilotiq-faq:hover_&]:opacity-100' }:
  { width: BlockWidth; onChange: (w: BlockWidth) => void; hoverClass?: string },
): ReactElement {
  const active = WIDTHS.find((w) => w.value === width) ?? WIDTHS[0]!
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            contentEditable={false}
            aria-label="Block width"
            style={{ insetInlineEnd: 0 }}
            className={
              'absolute top-0 z-10 flex w-max items-center gap-1 whitespace-nowrap rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm ' +
              'opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 ' + hoverClass
            }
          >
            {active.label}
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Popover.Popup className="min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden">
            {WIDTHS.map((w) => (
              <Popover.Close
                key={w.value}
                render={
                  <button
                    type="button"
                    onClick={() => onChange(w.value)}
                    className={
                      'flex w-full items-center rounded px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground ' +
                      (w.value === width ? 'bg-accent/50' : '')
                    }
                  >
                    {w.label}
                  </button>
                }
              />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
