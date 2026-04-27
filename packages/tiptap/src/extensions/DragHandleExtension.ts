import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const dragHandlePluginKey = new PluginKey('pilotiqDragHandle')

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
  const handle = document.createElement('button')
  handle.type = 'button'
  handle.setAttribute('data-pilotiq-drag-handle', '')
  handle.setAttribute('contenteditable', 'false')
  handle.setAttribute('aria-label', 'Drag block')
  handle.setAttribute('draggable', 'true')
  handle.style.cssText = [
    'position: absolute',
    'display: none',
    'cursor: grab',
    'background: transparent',
    'border: 0',
    'padding: 4px',
    'color: var(--muted-foreground, #888)',
    'opacity: 0',
    'transition: opacity 0.15s',
    'z-index: 50',
    'line-height: 1',
    'border-radius: 4px',
  ].join(';')
  handle.innerHTML = '<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="9" cy="8" r="1.5"/><circle cx="9" cy="13" r="1.5"/></svg>'
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
    // Climb to depth 1 = top-level block.
    const blockPos = $pos.before(1)
    const blockNode = view.nodeDOM(blockPos) as HTMLElement | null
    if (!blockNode) {
      hide()
      return
    }
    const rect = blockNode.getBoundingClientRect()
    handle.style.display = 'block'
    handle.style.opacity = '1'
    handle.style.top  = `${rect.top + window.scrollY + 4}px`
    handle.style.left = `${rect.left + window.scrollX - 28}px`
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
    if (activePos === null) return
    // Select the node so PM's built-in drag-drop ships the right slice.
    const tr = view.state.tr.setSelection(
      // @ts-ignore — NodeSelection is available on `pm/state`'s namespace
      (view.state.selection.constructor as any).create
        ? (view.state.selection.constructor as any).create(view.state.doc, activePos)
        : view.state.selection,
    )
    view.dispatch(tr)
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    // Forward to PM's editable handler — it sets up the move/drop transaction.
    const slice = view.state.doc.slice(activePos, activePos + view.state.doc.nodeAt(activePos)!.nodeSize)
    event.dataTransfer.setData('text/html', slice.content.toString())
    handle.style.cursor = 'grabbing'
  }

  const onDragEnd = (): void => {
    handle.style.cursor = 'grab'
  }

  view.dom.addEventListener('mousemove', onMouseMove)
  view.dom.addEventListener('mouseleave', onMouseLeave)
  handle.addEventListener('dragstart', onDragStart)
  handle.addEventListener('dragend', onDragEnd)

  return {
    destroy: () => {
      view.dom.removeEventListener('mousemove', onMouseMove)
      view.dom.removeEventListener('mouseleave', onMouseLeave)
      handle.removeEventListener('dragstart', onDragStart)
      handle.removeEventListener('dragend', onDragEnd)
      handle.remove()
    },
  }
}
