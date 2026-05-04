import { useEffect, useMemo, useRef, useState } from 'react'
import type { MentionItem } from '../MentionProvider.js'

/**
 * Mutable ref the document-level keydown listener in `TiptapEditor` reads.
 * `MentionMenu` installs its keyboard handler on mount, clears on unmount —
 * same protocol as `SlashMenu`'s `keyHandlerRef`.
 */
export type MentionKeyHandlerRef = { current: ((event: KeyboardEvent) => boolean) | null }

interface MentionMenuProps {
  trigger:       string
  items:         MentionItem[]
  command:       (item: MentionItem) => void
  keyHandlerRef: MentionKeyHandlerRef
}

/**
 * Floating list of mention items. Mirrors `SlashMenu` but uses the lighter
 * `MentionItem` shape (no command thunk per item — the `command` prop is
 * pre-curried by the Suggestion plugin).
 *
 * Optional `group` strings on items render as section headings; items
 * without a group land under "Suggestions".
 */
export function MentionMenu({ trigger, items, command, keyHandlerRef }: MentionMenuProps) {
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const grouped = useMemo(
    () => groupBy(items, (it) => it.group ?? 'Suggestions'),
    [items],
  )
  const renderOrder = useMemo(
    () => Array.from(grouped.values()).flat(),
    [grouped],
  )

  useEffect(() => { setActive(0) }, [renderOrder])

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

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
                key={item.id}
                data-index={idx}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); command(item) }}
                onMouseEnter={() => setActive(idx)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
                  isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                }`}
              >
                <span className="flex size-6 items-center justify-center rounded border bg-background text-xs">
                  {trigger}
                </span>
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.id}</span>
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
