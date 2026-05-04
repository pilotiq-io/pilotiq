import { useEffect, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { Tooltip } from '@base-ui/react/tooltip'
import { Dialog } from '@base-ui/react/dialog'
import type { ToolbarGroups, ToolbarButtonId, ColorSwatch } from '../RichTextField.js'
import { TOOLBAR_BUTTONS, type ToolbarButtonDef } from './toolbarButtons.js'
import { Palette } from './Palette.js'

interface ToolbarProps {
  editor:           Editor
  groups:           ToolbarGroups
  /** Force re-render when the selection / active marks change. */
  tick:             number
  textColors:       ColorSwatch[]
  customTextColors: boolean
  highlightColors:  ColorSwatch[]
  /**
   * Open the upload dialog. The dialog itself is mounted in the parent
   * (`ClientEditor`) so the slash menu's "Image" entry can share the
   * same mount — Toolbar just toggles the controlled flag.
   */
  onAttachOpenChange: (open: boolean) => void
}

/**
 * Always-on toolbar rendered above the editor. Groups are joined with thin
 * dividers; unknown / unavailable button ids are silently dropped so config
 * can target later-phase buttons today without crashing.
 *
 * Inline link button opens a Base UI dialog with a URL input — kept here
 * (not in the FloatingToolbar's dialog) because each toolbar instance owns
 * its own React state for the modal.
 */
export function Toolbar({
  editor, groups, tick, textColors, customTextColors, highlightColors,
  onAttachOpenChange,
}: ToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl,  setLinkUrl]  = useState('')

  const filteredGroups = groups
    .map((g) => g.map((id) => TOOLBAR_BUTTONS[id]).filter((b): b is ToolbarButtonDef => Boolean(b?.available)))
    .filter((g) => g.length > 0)

  if (filteredGroups.length === 0) return null

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

  return (
    <>
      <Tooltip.Provider delay={400}>
        <div
          // The toolbar sits visually attached to the top of the editor body —
          // shared border-radius + a `border-b` on the toolbar gives a single
          // grouped look. Editor body's own border-radius is reset top-side
          // via global classnames in the editor.
          className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-input bg-muted/30 px-1 py-1 text-foreground"
          // Mousedown anywhere in the toolbar should not steal focus from the
          // editor — `preventDefault` keeps the selection alive while the
          // command runs.
          onMouseDown={(e) => { e.preventDefault() }}
          data-tick={tick}
        >
          {filteredGroups.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
              {group.map((btn) => {
                if (btn.custom === 'textColor') {
                  return (
                    <Palette
                      key={btn.id}
                      swatches={textColors}
                      custom={customTextColors}
                      activeColor={editor.getAttributes('textStyle')['color'] as string | undefined}
                      onPick={(value) => editor.chain().focus().setColor(value).run()}
                      onClear={() => editor.chain().focus().unsetColor().run()}
                      clearLabel="Reset color"
                      trigger={
                        <ToolbarButton def={btn} editor={editor} />
                      }
                    />
                  )
                }
                if (btn.custom === 'highlight') {
                  return (
                    <Palette
                      key={btn.id}
                      swatches={highlightColors}
                      custom={false}
                      activeColor={editor.getAttributes('highlight')['color'] as string | undefined}
                      onPick={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
                      onClear={() => editor.chain().focus().unsetHighlight().run()}
                      clearLabel="Remove highlight"
                      trigger={
                        <ToolbarButton def={btn} editor={editor} />
                      }
                    />
                  )
                }
                const customClick =
                  btn.custom === 'link'         ? openLinkDialog :
                  btn.custom === 'attachFiles'  ? () => onAttachOpenChange(true) :
                  undefined
                return (
                  <ToolbarButton
                    key={btn.id}
                    def={btn}
                    editor={editor}
                    onCustomClick={customClick}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </Tooltip.Provider>
      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        url={linkUrl}
        onUrlChange={setLinkUrl}
        onApply={applyLink}
        onRemove={editor.isActive('link') ? removeLink : null}
        isEdit={editor.isActive('link')}
      />
      {/* Attach-files dialog mount lives in `ClientEditor` (single source of
          truth — slash-menu Image entry shares the same state). */}
    </>
  )
}

interface ToolbarButtonProps {
  def:           ToolbarButtonDef
  editor:        Editor
  onCustomClick?: (() => void) | undefined
}

function ToolbarButton({ def, editor, onCustomClick }: ToolbarButtonProps) {
  const active   = def.isActive?.(editor) ?? false
  const disabled = def.isDisabled?.(editor) ?? false
  const mod      = isMac() ? '⌘' : 'Ctrl+'
  const tooltip  = def.shortcut ? `${def.label} (${mod}${def.shortcut})` : def.label

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (onCustomClick) { onCustomClick(); return }
              def.command(editor)
            }}
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
        <Tooltip.Positioner side="bottom" sideOffset={6} className="isolate z-50">
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {tooltip}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function AttachFilesDialog({
  open, onOpenChange, editor,
  uploadUrl, fieldName, acceptedFileTypes, maxFileSize, directory, visibility,
}: {
  open:               boolean
  onOpenChange:       (open: boolean) => void
  editor:             Editor
  uploadUrl?:         string
  fieldName:          string
  acceptedFileTypes?: string[]
  maxFileSize?:       number
  directory?:         string
  visibility?:        'public' | 'private'
}) {
  const [file, setFile]     = useState<File | null>(null)
  const [alt,  setAlt]      = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Reset transient state every time the dialog opens — otherwise the
  // previous upload's filename / alt text would leak into the next one.
  useEffect(() => {
    if (open) { setFile(null); setAlt(''); setError(null); setBusy(false) }
  }, [open])

  const accept = acceptedFileTypes?.join(',') ?? 'image/*'

  const onPickFile = (f: File | null): void => {
    setError(null)
    if (!f) { setFile(null); return }
    if (maxFileSize !== undefined && f.size > maxFileSize) {
      setError(`File exceeds the maximum size of ${formatBytes(maxFileSize)}.`)
      setFile(null)
      return
    }
    setFile(f)
    if (alt === '') setAlt(stripExtension(f.name))
  }

  const onUpload = async (): Promise<void> => {
    if (!file) return
    if (!uploadUrl) {
      setError('No upload route configured for this panel.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('fieldName', fieldName)
      if (directory)  fd.append('directory',  directory)
      if (visibility) fd.append('visibility', visibility)
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => ({} as { ok?: boolean; url?: string; error?: string }))
      if (!res.ok || !data.ok || !data.url) {
        setError(data.error ?? `Upload failed (status ${res.status}).`)
        return
      }
      // Image vs non-image file. Tiptap's StarterKit doesn't ship a generic
      // file/attachment node, so for non-images we fall back to inserting
      // a link mark on the filename — same shape MarkdownField uses.
      if (file.type.startsWith('image/')) {
        editor.chain().focus().setImage({ src: data.url, alt: alt || file.name }).run()
      } else {
        editor.chain().focus()
          .insertContent({
            type: 'text',
            text: alt || file.name,
            marks: [{ type: 'link', attrs: { href: data.url } }],
          })
          .run()
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="text-lg leading-none font-semibold">
            Attach file
          </Dialog.Title>
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept={accept}
              disabled={busy}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80"
            />
            {file && (
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Alt text (described for screen readers)"
                disabled={busy}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            )}
            {maxFileSize !== undefined && (
              <p className="text-xs text-muted-foreground">
                Maximum size: {formatBytes(maxFileSize)}.
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
          <div className="flex flex-row-reverse items-center gap-2">
            <button
              type="button"
              onClick={onUpload}
              disabled={!file || busy}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? 'Uploading…' : 'Insert'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function LinkDialog({
  open, onOpenChange, url, onUrlChange, onApply, onRemove, isEdit,
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
              if (e.key === 'Enter') { e.preventDefault(); onApply() }
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

/**
 * Hook returning a tick that bumps on any selection / transaction change.
 * The Toolbar renders dependent on this so active-state booleans stay fresh.
 */
export function useEditorTick(editor: Editor | null): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const bump = (): void => setTick((t) => t + 1)
    editor.on('selectionUpdate', bump)
    editor.on('transaction', bump)
    return () => {
      editor.off('selectionUpdate', bump)
      editor.off('transaction', bump)
    }
  }, [editor])
  return tick
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

// Re-export the unused name so consumers can satisfy ToolbarGroups type checks
// when wiring custom layouts. Empty re-export side-effects nothing.
export type { ToolbarButtonId }
