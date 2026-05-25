import React from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Shared `@dnd-kit` row-reorder primitives for the field inputs that let
 * the user drag rows — `RepeaterInput` / `BuilderInput` (and the same
 * pattern the table renderer uses inline). Replaces the legacy HTML5-DnD
 * `useRowReorderDnd` hook with `@dnd-kit`'s animated, keyboard-accessible
 * sortable.
 *
 * Usage: wrap the row list in `<SortableRows>` (only when reorder is on —
 * it's a pass-through otherwise so non-reorderable lists pay nothing and
 * `useSortable` is never reached), and render each draggable row through
 * `<SortableRowSlot>`'s render-prop so the row component stays a single
 * component that just consumes the handle:
 *
 *   <SortableRows enabled={reorderable} ids={ids} onReorder={handleReorder}>
 *     {rows.map(r => reorderable
 *       ? <SortableRowSlot key={r.id} id={r.id} disabled={r.canReorder === false}>
 *           {(h) => <Row row={r} sortable={h} />}
 *         </SortableRowSlot>
 *       : <Row key={r.id} row={r} sortable={undefined} />)}
 *   </SortableRows>
 */

/** Per-row drag handle — spread onto the row element + its grip. */
export interface SortableRowHandle {
  /** Attach to the row's root element (the thing that moves while dragging). */
  setNodeRef: (el: HTMLElement | null) => void
  /** Inline transform/transition to apply to the row's root element. */
  style:      React.CSSProperties
  /** Spread onto the grip handle (`{...attributes} {...listeners}`) — only
   *  the grip starts a drag, so row contents (inputs, Tiptap) stay usable. */
  gripProps:  Record<string, unknown>
  /** True while this row is the one being dragged. */
  isDragging: boolean
}

export function SortableRows({
  enabled, ids, onReorder, children,
}: {
  enabled:   boolean
  ids:       string[]
  /** Fires on drop with the dragged row id + the row it was dropped onto. */
  onReorder: (activeId: string, overId: string) => void
  children:  React.ReactNode
}): React.ReactElement {
  const sensors = useSensors(
    // Small activation distance so a click on a row input never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  if (!enabled) return <>{children}</>
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e
        if (over !== null && active.id !== over.id) onReorder(String(active.id), String(over.id))
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/**
 * Render-prop wrapper that calls `useSortable` for one row and hands the
 * row component a `SortableRowHandle`. Must render inside a `<SortableRows>`
 * (which provides the `SortableContext`); the parent only mounts it when
 * reorder is enabled, so `useSortable` is never called without context.
 */
export function SortableRowSlot({
  id, disabled, children,
}: {
  id:       string
  disabled: boolean
  children: (handle: SortableRowHandle) => React.ReactNode
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })
  const handle: SortableRowHandle = {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), ...(transition ? { transition } : {}) },
    gripProps: disabled ? {} : { ...attributes, ...listeners },
    isDragging,
  }
  return <>{children(handle)}</>
}
