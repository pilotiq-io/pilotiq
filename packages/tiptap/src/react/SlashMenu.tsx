import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlashItem } from '../extensions/SlashCommandExtension.js'

/**
 * Mutable ref the document-level keydown listener in `TiptapEditor` reads.
 * `SlashMenu` installs its keyboard handler on mount, clears on unmount.
 */
export type SlashKeyHandlerRef = { current: ((event: KeyboardEvent) => boolean) | null }

interface SlashMenuProps {
  items:         SlashItem[]
  command:       (item: SlashItem) => void
  keyHandlerRef: SlashKeyHandlerRef
}

/**
 * Floating list of slash items. Mounted by the Base UI Popover in
 * TiptapEditor; the popover's anchor is a virtual element, so we don't need
 * to position the menu ourselves.
 *
 * Keys: ArrowUp / ArrowDown to move, Enter to pick. Escape is handled in
 * `SlashCommandExtension.onKeyDown` (closes the popup directly).
 */
export function SlashMenu({ items, command, keyHandlerRef }: SlashMenuProps) {
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Group items for visual organisation, then derive the flat render-order
  // array. `items` is in plugin order (paragraph, h1, h2, h3, …) but we
  // render grouped (Basic/Headings/Lists/Blocks). The active index must
  // track render order — otherwise ArrowDown highlights item N visually
  // but Enter inserts items[N] from the plugin-order array, which is a
  // different item.
  const grouped = useMemo(
    () => groupBy(items, (it) => it.group ?? 'Other'),
    [items],
  )
  const renderOrder = useMemo(
    () => Array.from(grouped.values()).flat(),
    [grouped],
  )

  // Reset selection when the filtered list changes.
  useEffect(() => { setActive(0) }, [renderOrder])

  // Keep the active item in view inside the scroll container.
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Install the keyboard bridge for the document-level listener in
  // TiptapEditor.
  useEffect(() => {
    keyHandlerRef.current = (event) => {
      const len = renderOrder.length
      if (event.key === 'ArrowDown') {
        setActive((i) => (len === 0 ? 0 : (i + 1) % len))
        return true
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (len === 0 ? 0 : (i - 1 + len) % len))
        return true
      }
      if (event.key === 'Enter') {
        const item = renderOrder[active]
        if (item) command(item)
        return true
      }
      return false
    }
    return () => { keyHandlerRef.current = null }
  }, [renderOrder, active, command, keyHandlerRef])

  if (renderOrder.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No matches
      </div>
    )
  }

  let runningIndex = 0
  return (
    <div ref={containerRef} className="max-h-72 w-64 overflow-y-auto p-1 text-sm">
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
}

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
