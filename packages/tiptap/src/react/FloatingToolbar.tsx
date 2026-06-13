import { useEffect, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { Tooltip } from '@base-ui/react/tooltip'
import { Dialog } from '@base-ui/react/dialog'

import { shouldShowFloatingToolbar } from './floatingToolbarVisibility.js'

interface FloatingToolbarProps {
  editor: Editor
}

/**
 * Selection-based formatting toolbar. Visible on a non-empty range inside
 * text content, AND on a bare caret sitting inside a formatting mark (so a
 * link / bold span can be edited without selecting it first — #156). Inline
 * marks (B/I/S/Code) are grouped together; Link sits after a separator since
 * it's a different kind of action. Visibility is decided by the pure
 * `shouldShowFloatingToolbar` predicate; this component only positions.
 */
export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [pos,      setPos]      = useState<{ top: number; left: number } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl,  setLinkUrl]  = useState('')

  useEffect(() => {
    const update = (): void => {
      if (!shouldShowFloatingToolbar(editor.state)) { setPos(null); return }
      const { from, to } = editor.state.selection
      // For a bare caret `from === to`, so both coords resolve to the caret
      // point and the toolbar centers above it.
      const start = editor.view.coordsAtPos(from)
      const end   = editor.view.coordsAtPos(to)
      // Viewport-relative — pair with `position: fixed` below. The wrapper
      // around <EditorContent> is `position: relative`, so an absolute toolbar
      // would be positioned relative to it instead of the viewport.
      // Lift the toolbar above the selection. The value is the toolbar's full
      // height plus a small breathing gap; bump if the toolbar grows.
      const top  = Math.min(start.top, end.top) - 48
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

  const openLinkDialog = (): void => {
    const previousUrl = editor.getAttributes('link')['href'] as string | undefined
    setLinkUrl(previousUrl ?? '')
    setLinkOpen(true)
  }

  const applyLink = (): void => {
    setLinkOpen(false)
    const trimmed = linkUrl.trim()
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  const removeLink = (): void => {
    setLinkOpen(false)
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
  }

  const mod    = isMac() ? '⌘' : 'Ctrl+'
  const isLink = editor.isActive('link')

  return (
    <>
      {pos && (
        <Tooltip.Provider delay={400}>
          <div
            className="fixed z-40 flex items-center gap-0.5 rounded-md border bg-popover px-1 py-1 text-popover-foreground shadow-md"
            style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
          >
            <ToolbarButton
              label={`Bold (${mod}B)`}
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton
              label={`Italic (${mod}I)`}
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <ItalicIcon />
            </ToolbarButton>
            <ToolbarButton
              label={`Strikethrough (${mod}⇧X)`}
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <StrikeIcon />
            </ToolbarButton>
            <ToolbarButton
              label={`Code (${mod}E)`}
              active={editor.isActive('code')}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <CodeIcon />
            </ToolbarButton>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            <ToolbarButton
              label={isLink ? 'Edit link' : 'Add link'}
              active={isLink}
              onClick={openLinkDialog}
            >
              <LinkIcon />
            </ToolbarButton>
          </div>
        </Tooltip.Provider>
      )}
      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        url={linkUrl}
        onUrlChange={setLinkUrl}
        onApply={applyLink}
        onRemove={isLink ? removeLink : null}
        isEdit={isLink}
      />
    </>
  )
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            // mousedown + preventDefault keeps editor focus so the selection
            // (and therefore the toolbar) survives the click.
            onMouseDown={(e) => { e.preventDefault(); onClick() }}
            className={`inline-flex h-7 w-7 items-center justify-center rounded text-foreground transition-colors ${
              active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
            }`}
            aria-label={label}
            aria-pressed={active}
          >
            {children}
          </button>
        )}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} className="isolate z-50">
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function LinkDialog({
  open,
  onOpenChange,
  url,
  onUrlChange,
  onApply,
  onRemove,
  isEdit,
}: {
  open:         boolean
  onOpenChange: (open: boolean) => void
  url:          string
  onUrlChange:  (url: string) => void
  onApply:      () => void
  onRemove:     (() => void) | null
  isEdit:       boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="text-lg leading-none font-semibold">
            {isEdit ? 'Edit link' : 'Add link'}
          </Dialog.Title>
          <input
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onApply()
              }
            }}
            placeholder="https://example.com"
            autoFocus
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex flex-row-reverse items-center gap-2">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isEdit ? 'Update' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="me-auto inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                Remove link
              </button>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  // navigator.platform is deprecated but still the most reliable signal here.
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

// Inline SVG icons (lucide.dev paths). Kept inline so this package doesn't
// pull `lucide-react` as a peer dep — the rest of @pilotiq/tiptap is already
// inline-SVG (DragHandle).
function BoldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 12h9a4 4 0 0 1 0 8H6Z" />
      <path d="M6 4h7a4 4 0 0 1 0 8H6Z" />
    </svg>
  )
}

function ItalicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5"  y2="20" />
      <line x1="15" y1="4" x2="9"   y2="20" />
    </svg>
  )
}

function StrikeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
