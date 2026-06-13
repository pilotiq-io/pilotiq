import { type ReactElement, type ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'

/**
 * Reusable in-block **settings** menu — a gear trigger outset in the inline-end
 * gutter (mirroring the drag handle on the start side), opening a nested menu
 * where each block setting is a submenu. Blocks with multiple variations (Alert
 * = width + type + icon + color; FAQ = width) all surface their controls through
 * one consistent entry point instead of a scattered control cluster.
 *
 * Two setting kinds:
 *  - `select` — a radio submenu of mutually-exclusive options (Width, Type). The
 *    active option's label rides the parent row as a hint; picking keeps the menu
 *    open so the change previews live.
 *  - `custom` — a submenu whose body is caller-supplied JSX (icon grid, color
 *    swatches). The caller owns the interactions; plain buttons inside don't
 *    auto-close the menu.
 *
 * The caller owns every attr write + the matching `data-*` / read-side CSS.
 */
export type BlockWidth = 'contained' | 'full'

export type BlockSettingOption = { value: string; label: string; icon?: ReactNode }

export type BlockSetting =
  | {
      kind: 'select'
      key: string
      label: string
      value: string
      options: BlockSettingOption[]
      onChange: (value: string) => void
    }
  | {
      kind: 'custom'
      key: string
      label: string
      /** Short hint shown on the parent row (e.g. the current icon / color). */
      hint?: ReactNode
      /** Submenu body — caller-supplied JSX. */
      content: ReactNode
    }

const gear = (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const chevronRight = (
  <svg viewBox="0 0 24 24" className="ms-auto size-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m9 18 6-6-6-6" /></svg>
)

const check = (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
)

const POPUP =
  'min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden'
const ROW =
  'flex w-full cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-hidden ' +
  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

function activeLabel(s: Extract<BlockSetting, { kind: 'select' }>): string {
  return s.options.find((o) => o.value === s.value)?.label ?? ''
}

export function BlockSettingsMenu(
  {
    settings,
    hoverClass = '[.pilotiq-faq:hover_&]:opacity-100',
    label = 'Block settings',
    triggerClass = 'top-0 -end-[30px]',
  }:
  { settings: BlockSetting[]; hoverClass?: string; label?: string; triggerClass?: string },
): ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            contentEditable={false}
            aria-label={label}
            className={
              'absolute z-10 flex items-center justify-center rounded border bg-background p-1 text-muted-foreground shadow-sm ' +
              'opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 ' +
              triggerClass + ' ' + hoverClass
            }
          >
            {gear}
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Menu.Popup className={POPUP}>
            {settings.map((s) => (
              <Menu.SubmenuRoot key={s.key}>
                <Menu.SubmenuTrigger className={ROW}>
                  <span>{s.label}</span>
                  <span className="ms-auto flex items-center gap-1 text-xs text-muted-foreground">
                    {s.kind === 'select' ? activeLabel(s) : s.hint}
                  </span>
                  {chevronRight}
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner side="inline-end" align="start" sideOffset={2} className="isolate z-50">
                    <Menu.Popup className={POPUP}>
                      {s.kind === 'select' ? (
                        <Menu.RadioGroup value={s.value} onValueChange={(v) => s.onChange(String(v))}>
                          {s.options.map((o) => (
                            <Menu.RadioItem key={o.value} value={o.value} className={ROW}>
                              {o.icon && <span className="flex size-4 items-center justify-center">{o.icon}</span>}
                              <span>{o.label}</span>
                              <Menu.RadioItemIndicator className="ms-auto flex">{check}</Menu.RadioItemIndicator>
                            </Menu.RadioItem>
                          ))}
                        </Menu.RadioGroup>
                      ) : (
                        s.content
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
