import { useState, type ReactNode } from 'react'
import { Popover } from '@base-ui/react/popover'
import type { ColorSwatch } from '../RichTextField.js'

interface PaletteProps {
  /** Trigger button — usually the toolbar's `textColor` / `highlight` button. */
  trigger:        ReactNode
  swatches:       ColorSwatch[]
  /** Whether to render a free-form color picker below the swatches. */
  custom:         boolean
  /** Currently active color, when known. Used to show the highlight ring. */
  activeColor?:   string | undefined
  /** Pick a swatch (or the custom-picker value). */
  onPick:         (value: string) => void
  /** Clear the color (removes the mark). */
  onClear:        () => void
  clearLabel?:    string
}

/**
 * Swatch popover anchored to a toolbar button. Drives `textColor` and
 * `highlight` — both share the same UI shape, only the swatches and the
 * `onPick`/`onClear` wiring differ.
 *
 * Mounts open / closed itself; consumers don't manage the open state.
 */
export function Palette({
  trigger, swatches, custom, activeColor, onPick, onClear, clearLabel = 'No color',
}: PaletteProps) {
  const [open, setOpen] = useState(false)

  const close = (): void => setOpen(false)
  const pick  = (value: string): void => { onPick(value); close() }
  const clear = (): void => { onClear(); close() }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger as React.ReactElement} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup
            className="rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <div className="grid grid-cols-5 gap-1">
              {swatches.map((s) => {
                const isActive = activeColor && activeColor.toLowerCase() === s.value.toLowerCase()
                return (
                  <button
                    key={s.value}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    aria-pressed={Boolean(isActive)}
                    onClick={() => pick(s.value)}
                    className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                      isActive ? 'ring-2 ring-ring ring-offset-1' : 'border-border/60'
                    }`}
                    style={{ background: s.value }}
                  />
                )
              })}
            </div>
            {custom && (
              <label className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Custom</span>
                <input
                  type="color"
                  defaultValue={activeColor ?? '#000000'}
                  onChange={(e) => onPick(e.target.value)}
                  className="h-6 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
            )}
            <button
              type="button"
              onClick={clear}
              className="mt-2 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {clearLabel}
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
