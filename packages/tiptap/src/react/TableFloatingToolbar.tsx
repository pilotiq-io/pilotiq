import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Tooltip } from '@base-ui/react/tooltip'
import type { ToolbarButtonId } from '../RichTextField.js'
import { TOOLBAR_BUTTONS, type ToolbarButtonDef } from './toolbarButtons.js'

interface TableFloatingToolbarProps {
  editor: Editor
}

/**
 * Cell-management toolbar shown whenever the cursor is inside a table. Pinned
 * to the top edge of the enclosing `<table>`, viewport-relative so it tracks
 * scroll without forcing the editor wrapper to be `position: relative`.
 *
 * Buttons map directly onto the table-* ids registered in `toolbarButtons.tsx`,
 * so the icons / disabled gates / commands stay in sync with the top-level
 * toolbar's table buttons.
 */
const TABLE_BUTTON_GROUPS: ToolbarButtonId[][] = [
  ['tableAddColumnBefore', 'tableAddColumnAfter', 'tableDeleteColumn'],
  ['tableAddRowBefore',    'tableAddRowAfter',    'tableDeleteRow'],
  ['tableMergeCells', 'tableSplitCell'],
  ['tableToggleHeaderRow', 'tableToggleHeaderCell'],
  ['tableDelete'],
]

export function TableFloatingToolbar({ editor }: TableFloatingToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // Force re-render when the selection moves so isActive / isDisabled flip.
  const [, setTick] = useState(0)

  useEffect(() => {
    const update = (): void => {
      if (!editor.isActive('table')) { setPos(null); return }
      const tableDom = findEnclosingTable(editor)
      if (!tableDom) { setPos(null); return }
      const rect = tableDom.getBoundingClientRect()
      // Lift the toolbar above the table — height of the strip + breathing room.
      // Bump if the strip grows.
      const top  = rect.top - 44
      const left = rect.left + rect.width / 2
      setPos({ top, left })
    }
    const close = (): void => setPos(null)
    update()
    editor.on('selectionUpdate', update)
    editor.on('transaction',     update)
    editor.on('blur',             close)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction',     update)
      editor.off('blur',             close)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  // Refresh the disabled/active state predicates on every tx — the buttons
  // read these inline against the live editor.
  useEffect(() => {
    if (!editor) return
    const bump = (): void => setTick((t) => t + 1)
    editor.on('selectionUpdate', bump)
    editor.on('transaction',     bump)
    return () => {
      editor.off('selectionUpdate', bump)
      editor.off('transaction',     bump)
    }
  }, [editor])

  if (!pos) return null

  const groups = TABLE_BUTTON_GROUPS
    .map((g) => g.map((id) => TOOLBAR_BUTTONS[id]).filter((b): b is ToolbarButtonDef => Boolean(b?.available)))
    .filter((g) => g.length > 0)

  return (
    <Tooltip.Provider delay={400}>
      <div
        className="fixed z-40 flex items-center gap-0.5 rounded-md border bg-popover px-1 py-1 text-popover-foreground shadow-md"
        style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
        // mousedown shouldn't steal focus — keeps the cell selection alive
        // while the command runs.
        onMouseDown={(e) => { e.preventDefault() }}
      >
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
            {group.map((btn) => (
              <TableButton key={btn.id} def={btn} editor={editor} />
            ))}
          </div>
        ))}
      </div>
    </Tooltip.Provider>
  )
}

function TableButton({ def, editor }: { def: ToolbarButtonDef; editor: Editor }) {
  const active   = def.isActive?.(editor) ?? false
  const disabled = def.isDisabled?.(editor) ?? false
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            disabled={disabled}
            onClick={() => def.command(editor)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none ${
              active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
            }`}
            aria-label={def.label}
            aria-pressed={active}
          >
            {def.icon}
          </button>
        )}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} className="isolate z-50">
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {def.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

/**
 * Walk up from the current selection to find the enclosing `<table>` DOM node.
 * Returns `null` if the cursor isn't inside one. Uses `view.domAtPos` rather
 * than walking the document tree — works even when the cell is inside a
 * resize-NodeView wrapper.
 */
function findEnclosingTable(editor: Editor): HTMLElement | null {
  const { from } = editor.state.selection
  let dom: Node | null
  try {
    dom = editor.view.domAtPos(from).node
  } catch {
    return null
  }
  while (dom && dom !== editor.view.dom) {
    if (dom instanceof HTMLElement && dom.tagName === 'TABLE') return dom
    dom = dom.parentNode
  }
  return null
}
