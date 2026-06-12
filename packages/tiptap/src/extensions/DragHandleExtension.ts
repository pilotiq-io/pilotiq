import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const dragHandlePluginKey = new PluginKey('pilotiqDragHandle')

// Node types whose direct children are the draggable units (e.g. each
// `listItem` of a `bulletList` is a draggable unit). Listed forward-compat
// includes `taskList` even though StarterKit 3 doesn't ship it; if a consumer
// registers it later it'll just work.
const LIST_CONTAINERS = new Set(['bulletList', 'orderedList', 'taskList'])

/**
 * Hand-built drag handle: floats a six-dot button in the gutter on the left
 * of whichever top-level block the cursor is hovering. Click-drag to reorder.
 *
 * Implementation (kept self-contained, no `tiptap-extension-global-drag-handle`
 * dep — that pkg uses Tiptap internals that break across versions):
 *
 *  1. On mount, append a single `<button>` to `document.body`. It's the
 *     handle. Position lives in CSS `top` / `left`.
 *  2. On `mousemove` over the editor, find the top-level block under the
 *     cursor via `posAtCoords` + climb to depth 1, then read its DOM rect
 *     and align the handle to its top-left.
 *  3. On `mousedown` on the handle, set `node` selection on that block and
 *     dispatch a synthetic `dragstart` from the editor DOM — ProseMirror's
 *     own drop logic handles reorder.
 */
export const DragHandleExtension = Extension.create({
  name: 'pilotiqDragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: dragHandlePluginKey,
        view: (view) => createDragHandleView(view),
      }),
    ]
  },
})

function createDragHandleView(view: EditorView): {
  update?: () => void
  destroy: () => void
} {
  // A <div> (not <button>): a button grabs DOM focus on click, which yanks
  // focus out of the editor so a follow-up Backspace/Delete on the selected
  // block goes nowhere. A div doesn't steal focus, so click-to-select works.
  const handle = document.createElement('div')
  handle.setAttribute('role', 'button')
  handle.setAttribute('data-pilotiq-drag-handle', '')
  handle.setAttribute('contenteditable', 'false')
  handle.setAttribute('aria-label', 'Drag or select block')
  handle.setAttribute('draggable', 'true')
  handle.style.cssText = [
    'position: absolute',
    'display: none',
    'cursor: grab',
    'background: transparent',
    'border: 0',
    'padding: 2px',
    'color: var(--muted-foreground, #888)',
    'opacity: 0',
    'transition: opacity 0.15s',
    'z-index: 50',
    'line-height: 1',
    'border-radius: 4px',
  ].join(';')
  handle.innerHTML = '<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="10" r="1"/></svg>'
  document.body.appendChild(handle)

  let activePos: number | null = null

  const onMouseMove = (event: MouseEvent): void => {
    const editorRect = view.dom.getBoundingClientRect()
    const inside =
      event.clientX >= editorRect.left - 60 &&
      event.clientX <= editorRect.right &&
      event.clientY >= editorRect.top &&
      event.clientY <= editorRect.bottom
    if (!inside) {
      hide()
      return
    }
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
    if (!pos) {
      hide()
      return
    }
    const $pos = view.state.doc.resolve(pos.pos)
    // Pick the deepest ancestor whose parent is the doc OR a list container —
    // that's the "unit" the user expects the handle to grab. So inside a
    // bullet list, hovering an item resolves to the list_item (not the whole
    // bullet_list); inside a blockquote, hovering its inner paragraph resolves
    // to the blockquote (since the blockquote's parent is the doc).
    let blockDepth = 1
    for (let d = $pos.depth; d >= 1; d--) {
      const parentName = $pos.node(d - 1).type.name
      if (parentName === 'doc' || LIST_CONTAINERS.has(parentName)) {
        blockDepth = d
        break
      }
    }
    const blockPos  = $pos.before(blockDepth)
    const blockNode = view.nodeDOM(blockPos) as HTMLElement | null
    if (!blockNode) {
      hide()
      return
    }
    const rect = blockNode.getBoundingClientRect()
    handle.style.display = 'block'
    handle.style.opacity = '1'
    handle.style.top = `${rect.top + window.scrollY + 4}px`
    // Pin X to the editor's left gutter (not the block's left edge). For
    // nested content the block's `rect.left` sits past the indent / bullet
    // gutter, so handles for list items would overlap their bullets. Keeping
    // the handle in a fixed column lets the eye track which block it points
    // at by vertical alignment alone.
    handle.style.left = `${editorRect.left + window.scrollX + 16}px`
    activePos = blockPos
  }

  const hide = (): void => {
    handle.style.opacity = '0'
    handle.style.display = 'none'
    activePos = null
  }

  const onMouseLeave = (event: MouseEvent): void => {
    // Don't hide while moving onto the handle itself.
    if (event.relatedTarget === handle) return
    hide()
  }

  const onDragStart = (event: DragEvent): void => {
    if (activePos === null || !event.dataTransfer) return
    const node = view.state.doc.nodeAt(activePos)
    if (!node) return

    // Select the block as a NodeSelection so PM treats the drag as a node
    // move, not a text-range move.
    const selection = NodeSelection.create(view.state.doc, activePos)
    view.dispatch(view.state.tr.setSelection(selection))

    // PM's drop handler reads `view.dragging` for in-editor drags. Without
    // it the drop falls back to clipboard-HTML parsing and silently no-ops
    // (drop returns to origin). This is the line that actually fixes drop.
    const slice = selection.content()
    ;(view as unknown as { dragging: { slice: typeof slice; move: boolean } }).dragging = {
      slice,
      move: !event.ctrlKey && !event.metaKey,
    }

    // Use PM's clipboard serializer so the drag carries proper HTML — both
    // for cross-editor pastes and as the visible drag image.
    const { dom, text } = view.serializeForClipboard(slice)
    event.dataTransfer.clearData()
    event.dataTransfer.setData('text/html', dom.innerHTML)
    event.dataTransfer.setData('text/plain', text)
    event.dataTransfer.effectAllowed = 'copyMove'

    // Drag image = the actual block, not the handle button.
    const blockNode = view.nodeDOM(activePos) as HTMLElement | null
    if (blockNode) event.dataTransfer.setDragImage(blockNode, 0, 0)

    handle.style.cursor = 'grabbing'
  }

  const onDragEnd = (): void => {
    handle.style.cursor = 'grab'
  }

  // A plain click (no drag) selects the hovered block as a NodeSelection, so
  // the whole block can be deleted (Backspace / Delete) or replaced — the only
  // affordance for removing atom-ish custom blocks (FAQ, callout, grid, …).
  const onClick = (event: MouseEvent): void => {
    event.preventDefault()
    if (activePos === null) return
    if (!view.state.doc.nodeAt(activePos)) return
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, activePos)))
    view.focus()
  }

  view.dom.addEventListener('mousemove', onMouseMove)
  view.dom.addEventListener('mouseleave', onMouseLeave)
  handle.addEventListener('dragstart', onDragStart)
  handle.addEventListener('dragend', onDragEnd)
  handle.addEventListener('click', onClick)

  return {
    destroy: () => {
      view.dom.removeEventListener('mousemove', onMouseMove)
      view.dom.removeEventListener('mouseleave', onMouseLeave)
      handle.removeEventListener('dragstart', onDragStart)
      handle.removeEventListener('dragend', onDragEnd)
      handle.removeEventListener('click', onClick)
      handle.remove()
    },
  }
}
