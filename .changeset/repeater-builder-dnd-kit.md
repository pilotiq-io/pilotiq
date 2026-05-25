---
"@pilotiq/pilotiq": patch
---

feat(pilotiq): smooth row drag for Repeater & Builder via `@dnd-kit`

`RepeaterField` and `BuilderField` rows now reorder through `@dnd-kit` (`DndContext`/`SortableContext`/`useSortable`) instead of the legacy native HTML5 drag-and-drop — animated row shifts, keyboard-accessible (focus grip → Space → ↑/↓ → Space), grip-handle-only so inner inputs / Tiptap fields stay usable. This matches the smooth-drag behavior already shipped for reorderable tables. Covers every layout: stacked, `grid(n)` (free-axis sortable), `table([cols])`, and `accordion()`; Builder keeps `reorderableWithButtons()` (button-only reorder, no grip drag) and the `addBetween` insert zones. The Up/Down keyboard buttons, per-row capability gates (`itemCanReorder`), optimistic local reorder, and `rowBinding.reorder` collab broadcast are all unchanged. The shared `SortableRows` / `SortableRowSlot` primitives back both fields; the old `useRowReorderDnd` hook + per-row drop-indicator are removed.
