import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SlashItem } from '../extensions/SlashCommandExtension.js'

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashMenuProps {
  items:   SlashItem[]
  command: (item: SlashItem) => void
}

/**
 * Floating list of slash items. Tippy mounts this; keyboard navigation is
 * forwarded from the Suggestion plugin via the imperative ref.
 *
 * Keys: ArrowUp / ArrowDown to move, Enter to pick. Escape is handled in
 * the extension's `onKeyDown` (closes Tippy).
 */
export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ items, command }, ref) => {
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Reset selection when the filtered list changes.
  useEffect(() => { setActive(0) }, [items])

  // Keep the active item in view inside the scroll container.
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
        return true
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
        return true
      }
      if (event.key === 'Enter') {
        const item = items[active]
        if (item) command(item)
        return true
      }
      return false
    },
  }), [active, items, command])

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
        No matches
      </div>
    )
  }

  // Group items for visual organisation (matches lexical's grouped menu).
  const grouped = groupBy(items, (it) => it.group ?? 'Other')

  let runningIndex = 0
  return (
    <div
      ref={containerRef}
      className="max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
    >
      {Array.from(grouped.entries()).map(([groupName, groupItems]) => (
        <div key={groupName}>
          <div className="px-2 pt-2 pb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            {groupName}
          </div>
          {groupItems.map((item) => {
            const idx = runningIndex++
            const isActive = idx === active
            return (
              <button
                key={item.key}
                data-index={idx}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); command(item) }}
                onMouseEnter={() => setActive(idx)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
                  isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                }`}
              >
                {item.icon && (
                  <span className="flex size-6 items-center justify-center rounded border bg-background text-xs">
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}
