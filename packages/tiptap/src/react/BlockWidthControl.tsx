import { type ReactElement } from 'react'
import { Popover } from '@base-ui/react/popover'

/**
 * Reusable in-block **width** toggle — `contained` (max-width, centered) vs
 * `full` (full bleed). Mirrors the Alert variant picker's shape so any content
 * block can host the same control (FAQ today; Alert / future blocks next). The
 * caller owns the `width` attr + the matching `data-width` / CSS; this is just
 * the picker chrome.
 */
export type BlockWidth = 'contained' | 'full'

const WIDTHS: { value: BlockWidth; label: string; icon: ReactElement }[] = [
  {
    value: 'contained',
    label: 'Contained',
    icon: <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6" y="4" width="12" height="16" rx="1" /></svg>,
  },
  {
    value: 'full',
    label: 'Full width',
    icon: <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="1" /></svg>,
  },
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
            className={
              'absolute end-0 top-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity ' +
              'hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 ' + hoverClass
            }
          >
            {active.icon}
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Popover.Popup className="min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden">
            {WIDTHS.map((w) => (
              <Popover.Close
                key={w.value}
                render={
                  <button
                    type="button"
                    onClick={() => onChange(w.value)}
                    className={
                      'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground ' +
                      (w.value === width ? 'bg-accent/50' : '')
                    }
                  >
                    {w.icon}
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
