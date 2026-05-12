import React, { useState } from 'react'

/**
 * Shared HTML5 drag-and-drop wiring for any list of rows that the user
 * can reorder. Consumed by `TableRendererBody` (POSTs the new order
 * to the server with rollback), `RepeaterInput`, and `BuilderInput`
 * (both mutate local row state in place).
 *
 * Generic on `HTMLElement` so the same handlers wire onto a `<div>`
 * row (card / grid layouts) AND a `<tr>` row (table layout) — the
 * consumer cast happens at the JSX boundary.
 */

export interface RowReorderDnd {
  dragId: string | null
  /** The boundary slot the cursor is over (0..rows.length); null when no drag is active. */
  dropAt: number | null
  onDragStart: (id:  string) => (e: React.DragEvent<HTMLElement>) => void
  onDragOver:  (idx: number) => (e: React.DragEvent<HTMLElement>) => void
  onDrop:      (e: React.DragEvent<HTMLElement>) => void
  onDragEnd:   () => void
}

export interface UseRowReorderDndOptions {
  /** When false, every handler short-circuits without firing `onDrop`. */
  enabled: boolean
  /** Fires once per successful drop, after the hook has cleared its drag state. */
  onDrop:  (fromId: string, dropAt: number) => void | Promise<void>
}

export function useRowReorderDnd({
  enabled,
  onDrop,
}: UseRowReorderDndOptions): RowReorderDnd {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const handleDragStart = (id: string) => (e: React.DragEvent<HTMLElement>): void => {
    if (!enabled) return
    setDragId(id)
    // dataTransfer needs *something* to register the drag in Firefox.
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* IE quirk; ignore */ }
  }

  const handleDragOver = (idx: number) => (e: React.DragEvent<HTMLElement>): void => {
    if (!enabled || dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Drop above this row when cursor is in its top half, below when in its bottom half.
    const rect      = e.currentTarget.getBoundingClientRect()
    const aboveHalf = e.clientY < rect.top + rect.height / 2
    setDropAt(aboveHalf ? idx : idx + 1)
  }

  const handleDrop = (e: React.DragEvent<HTMLElement>): void => {
    if (!enabled || dragId === null || dropAt === null) {
      setDragId(null); setDropAt(null); return
    }
    e.preventDefault()
    const fromId = dragId
    const at     = dropAt
    setDragId(null); setDropAt(null)
    void onDrop(fromId, at)
  }

  const handleDragEnd = (): void => {
    setDragId(null); setDropAt(null)
  }

  return {
    dragId, dropAt,
    onDragStart: handleDragStart,
    onDragOver:  handleDragOver,
    onDrop:      handleDrop,
    onDragEnd:   handleDragEnd,
  }
}
