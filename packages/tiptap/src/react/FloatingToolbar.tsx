import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'

interface FloatingToolbarProps {
  editor: Editor
}

/**
 * Selection-based formatting toolbar. Visible whenever the editor has a
 * non-empty range selection inside text content. Stays minimal in v1 —
 * bold / italic / link only. Profile system can land later.
 */
export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const update = (): void => {
      const { from, to, empty } = editor.state.selection
      if (empty) { setPos(null); return }
      // Don't show on full-block selections (e.g. clicking a custom block).
      const slice = editor.state.doc.slice(from, to)
      if (slice.content.childCount === 0) { setPos(null); return }
      const start = editor.view.coordsAtPos(from)
      const end   = editor.view.coordsAtPos(to)
      // Viewport-relative — pair with `position: fixed` below. The wrapper
      // around <EditorContent> is `position: relative`, so an absolute toolbar
      // would be positioned relative to it instead of the viewport.
      const top  = Math.min(start.top, end.top) - 38
      const left = (start.left + end.right) / 2
      setPos({ top, left })
    }
    const close = (): void => setPos(null)
    editor.on('selectionUpdate', update)
    editor.on('blur', close)
    // Keep the toolbar pinned to the selection when the page or any scroll
    // ancestor scrolls (capture phase catches inner scrollers too).
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', close)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  if (!pos) return null

  const button = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`rounded px-2 py-1 text-xs font-medium ${
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed z-40 flex items-center gap-1 rounded-md border bg-popover px-1 py-1 shadow-md"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
    >
      {button('B', editor.isActive('bold'),   () => editor.chain().focus().toggleBold().run())}
      {button('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {button('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run())}
      {button('Code', editor.isActive('code'),() => editor.chain().focus().toggleCode().run())}
      {button(
        'Link',
        editor.isActive('link'),
        () => {
          const previousUrl = editor.getAttributes('link')['href'] as string | undefined
          // v1: native prompt. Replace with a popover later.
          const url = typeof window !== 'undefined' ? window.prompt('Link URL', previousUrl ?? '') : null
          if (url === null) return
          if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        },
      )}
    </div>
  )
}
