import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  UploadIcon, XIcon, FileIcon, Loader2Icon,
  GripVerticalIcon, DownloadIcon,
} from 'lucide-react'
import ReactCrop, {
  type Crop, type PixelCrop,
  centerCrop, makeAspectCrop, convertToPixelCrop,
} from 'react-image-crop'
import { useFieldState, FormIdContext } from '../FormStateContext.js'
import { registerPendingSuggestionApplier, type PendingSuggestionApplier } from '../PendingSuggestionApplierRegistry.js'
import { useToast } from '../Toaster.js'
import { Button } from '../ui/button.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog.js'
import { reorderRows } from './RepeaterInput.js'

/**
 * File upload UI. On file pick → POST multipart to `uploadUrl` →
 * stash returned URL in form state. Single-file shows the URL +
 * preview thumb (when image). Multi-file accumulates a list.
 */
export function FileUploadInput({
  name, defaultValue, disabled,
  accept, maxSize, multiple, preview, directory, uploadUrl,
  downloadable = false,
  openable     = false,
  reorderable        = false,
  appendFiles        = false,
  panelLayout        = 'list',
  automaticallyResize,
  imageEditor        = false,
  imageEditorAspectRatioOptions,
  circleCropper      = false,
  automaticallyCropImagesToAspectRatio = false,
}: {
  name:               string
  defaultValue:       unknown
  disabled:           boolean
  accept:             string[] | undefined
  maxSize:            number | undefined
  multiple:           boolean
  preview:            boolean
  directory:          string | undefined
  uploadUrl:          string | undefined
  downloadable:       boolean
  openable:           boolean
  reorderable:        boolean
  appendFiles:        boolean
  panelLayout:        'list' | 'grid' | 'integrated'
  automaticallyResize?: { width: number; height: number }
  imageEditor?:       boolean
  imageEditorAspectRatioOptions?: Array<{ ratio: number; label: string }>
  circleCropper?:     boolean
  automaticallyCropImagesToAspectRatio?: boolean
}): React.ReactElement {
  const fs        = useFieldState(name)
  const { notify } = useToast()
  const inputRef  = useRef<HTMLInputElement | null>(null)

  // Drag-and-drop state (reorderable only)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dropAt, setDropAt]           = useState<number | null>(null)

  // Image editor state
  const [editorState, setEditorState] = useState<{
    src: string
    file: File
    resolve: (f: File) => void
    reject:  () => void
  } | null>(null)
  const [crop, setCrop]                   = useState<Crop>({ unit: '%', x: 5, y: 5, width: 90, height: 90 })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>()
  const [activeRatio, setActiveRatio]     = useState<number | undefined>()
  const imgRef = useRef<HTMLImageElement | null>(null)

  const toUrls = (v: unknown): string[] => {
    if (v === undefined || v === null || v === '') return []
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string') {
      if (v.startsWith('[')) {
        try {
          const arr = JSON.parse(v)
          if (Array.isArray(arr)) return arr.map(String)
        } catch { /* fall through */ }
      }
      return [v]
    }
    return []
  }

  const [localUrls, setLocalUrls] = useState<string[]>(toUrls(defaultValue))
  const urls  = fs.controlled ? toUrls(fs.value) : localUrls
  const [busy, setBusy] = useState(false)

  const setUrls = (next: string[]): void => {
    const stored = multiple ? next : (next[0] ?? null)
    if (fs.controlled) {
      fs.setValue(stored)
      fs.triggerLive(stored)
    } else {
      setLocalUrls(next)
      fs.triggerLive(stored)
    }
  }

  // Cross-tree applier — FileUpload state lives in `urls` (React); the
  // hidden mirror input is write-only. FieldShell skips its generic
  // registration for fieldType === 'fileUpload'.
  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = toUrls(suggestion.suggestedValue)
      const stored = multiple ? next : (next[0] ?? null)
      const cur = fsRef.current
      if (cur.controlled) { cur.setValue(stored); cur.triggerLive(stored) }
      else { setLocalUrls(next); cur.triggerLive(stored) }
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId, multiple])

  // ── Image editor helpers ──────────────────────────────────────────────────

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    const { naturalWidth: nw, naturalHeight: nh } = img
    const initialCrop = activeRatio
      ? centerCrop(makeAspectCrop({ unit: '%', width: 90 }, activeRatio, nw, nh), nw, nh)
      : centerCrop({ unit: '%', width: 90, height: 90 }, nw, nh)
    setCrop(initialCrop)
    setCompletedCrop(convertToPixelCrop(initialCrop, img.width, img.height))
  }

  const onRatioChange = (ratio: number | undefined): void => {
    setActiveRatio(ratio)
    const img = imgRef.current
    if (!img) return
    const { naturalWidth: nw, naturalHeight: nh } = img
    const next = ratio
      ? centerCrop(makeAspectCrop({ unit: '%', width: 90 }, ratio, nw, nh), nw, nh)
      : centerCrop({ unit: '%', width: 90, height: 90 }, nw, nh)
    setCrop(next)
    setCompletedCrop(convertToPixelCrop(next, img.width, img.height))
  }

  const handleEditorApply = async (): Promise<void> => {
    if (!editorState || !completedCrop || !imgRef.current) return
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop, circleCropper, /* fromDisplay */ true)
      editorState.resolve(new File([blob], editorState.file.name, { type: blob.type }))
    } catch {
      editorState.reject()
    } finally {
      URL.revokeObjectURL(editorState.src)
      setEditorState(null)
    }
  }

  const handleEditorCancel = (): void => {
    if (!editorState) return
    editorState.reject()
    URL.revokeObjectURL(editorState.src)
    setEditorState(null)
  }

  /** Intercepts a file through the crop editor (or auto-crop) before upload. */
  const prepareFile = (file: File): Promise<File> => {
    if (!imageEditor) return Promise.resolve(file)

    const src = URL.createObjectURL(file)

    // Auto-crop: load image, compute center crop at first ratio, skip modal
    if (automaticallyCropImagesToAspectRatio && imageEditorAspectRatioOptions?.length) {
      const ratio = imageEditorAspectRatioOptions[0]!.ratio
      return new Promise<File>((resolve, reject) => {
        const img = new Image()
        img.onload = (): void => {
          URL.revokeObjectURL(src)
          const pct = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, ratio, img.naturalWidth, img.naturalHeight),
            img.naturalWidth, img.naturalHeight,
          )
          const px = convertToPixelCrop(pct, img.naturalWidth, img.naturalHeight)
          cropToBlob(img, px, circleCropper, /* fromDisplay */ false)
            .then(blob => resolve(new File([blob], file.name, { type: blob.type })))
            .catch(reject)
        }
        img.onerror = (): void => { URL.revokeObjectURL(src); reject(new Error('Image load failed')) }
        img.src = src
      })
    }

    // Manual editor: open modal, await user action
    return new Promise<File>((resolve, reject) => {
      setActiveRatio(imageEditorAspectRatioOptions?.[0]?.ratio)
      setEditorState({ src, file, resolve, reject })
    })
  }

  const onPick = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    if (!uploadUrl) {
      notify({ type: 'error', title: 'Upload URL missing', body: 'Pilotiq panel has no upload route configured.' })
      return
    }
    setBusy(true)
    // appendFiles keeps existing URLs; default replaces them
    const next = appendFiles ? [...urls] : []
    try {
      for (const file of Array.from(files)) {
        let preparedFile: File
        try {
          preparedFile = await prepareFile(file)
        } catch {
          continue // user cancelled the editor for this file
        }
        const fd = new FormData()
        fd.append('file', preparedFile)
        if (directory) fd.append('directory', directory)
        if (accept)    fd.append('accept', accept.join(','))
        if (maxSize !== undefined) fd.append('maxSize', String(maxSize))
        if (automaticallyResize) {
          fd.append('resize_width',  String(automaticallyResize.width))
          fd.append('resize_height', String(automaticallyResize.height))
        }
        fd.append('fieldName', name)
        const res  = await fetch(uploadUrl, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        const json = await res.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string }
        if (!res.ok || !json.ok || !json.url) {
          notify({ type: 'error', title: 'Upload failed', body: json.error ?? `HTTP ${res.status}` })
          continue
        }
        next.push(json.url)
        if (!multiple && !appendFiles) break
      }
      setUrls(next)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeAt = (i: number): void => setUrls(urls.filter((_, idx) => idx !== i))

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, i: number): void => {
    setDragFromIdx(i)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }

  const onDragEnd = (): void => { setDragFromIdx(null); setDropAt(null) }

  // Vertical list: insert before/after based on cursor Y vs item midpoint
  const onItemDragOver = (e: React.DragEvent, i: number): void => {
    if (dragFromIdx == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect   = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropAt(before ? i : i + 1)
  }

  // Grid tiles: insert before/after based on cursor X vs tile midpoint
  const onTileDragOver = (e: React.DragEvent, i: number): void => {
    if (dragFromIdx == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect   = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientX < rect.left + rect.width / 2
    setDropAt(before ? i : i + 1)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    if (dragFromIdx == null || dropAt == null) { onDragEnd(); return }
    const next = reorderRows(urls, dragFromIdx, dropAt)
    if (next !== urls) setUrls(next)
    onDragEnd()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hiddenValue = multiple ? JSON.stringify(urls) : (urls[0] ?? '')
  const isGrid      = panelLayout === 'grid' || panelLayout === 'integrated'

  // ── Shared sub-renders ────────────────────────────────────────────────────

  const thumbOrIcon = (url: string): React.ReactElement =>
    preview && isImage(url)
      ? <img src={url} alt="" className="size-full object-cover" />
      : <FileIcon className="size-8 text-muted-foreground" />

  const downloadBtn = (url: string): React.ReactElement => (
    <a
      href={url}
      download={fileNameFrom(url)}
      className="text-muted-foreground hover:text-foreground"
      aria-label="Download file"
      onClick={(e) => e.stopPropagation()}
    >
      <DownloadIcon className="size-4" />
    </a>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={hiddenValue} readOnly />

      {/* Upload trigger — hidden in integrated mode (button lives inside the grid) */}
      {panelLayout !== 'integrated' && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            {busy
              ? <Loader2Icon className="size-4 animate-spin" />
              : <UploadIcon  className="size-4" />
            }
            {multiple ? 'Choose files' : 'Choose file'}
          </Button>
          {maxSize !== undefined && (
            <span className="text-xs text-muted-foreground">
              Max {Math.round(maxSize / 1024)} KB
            </span>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept ? accept.join(',') : undefined}
        multiple={multiple || appendFiles}
        onChange={(e) => { void onPick(e.target.files) }}
      />

      {/* ── Grid / integrated layout ────────────────────────────────────── */}
      {isGrid && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <React.Fragment key={i}>
              {/* Drop indicator before tile */}
              {reorderable && dropAt === i && dragFromIdx !== null && dragFromIdx !== i && dragFromIdx + 1 !== i && (
                <div aria-hidden className="w-0.5 self-stretch rounded bg-primary" />
              )}
              <div
                className={[
                  'group relative flex flex-col items-center gap-1',
                  reorderable ? 'cursor-grab active:cursor-grabbing' : '',
                  dragFromIdx === i ? 'opacity-40' : '',
                ].join(' ')}
                draggable={reorderable}
                onDragStart={reorderable ? (e) => onDragStart(e, i) : undefined}
                onDragOver={reorderable  ? (e) => onTileDragOver(e, i) : undefined}
                onDragEnd={reorderable   ? onDragEnd : undefined}
                onDrop={reorderable      ? onDrop : undefined}
              >
                {/* Thumbnail tile */}
                <div className="relative size-20 rounded-md border border-input bg-muted overflow-hidden flex items-center justify-center">
                  {openable
                    ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="size-full block">
                        {thumbOrIcon(url)}
                      </a>
                    )
                    : thumbOrIcon(url)
                  }
                  {/* Hover overlay — actions */}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                    {downloadable && (
                      <a
                        href={url}
                        download={fileNameFrom(url)}
                        className="rounded p-0.5 text-white hover:text-primary-foreground"
                        aria-label="Download file"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DownloadIcon className="size-3.5" />
                      </a>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        className="rounded p-0.5 text-white hover:text-red-300"
                        onClick={() => removeAt(i)}
                        aria-label="Remove file"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <span className="w-20 truncate text-center text-xs text-muted-foreground">
                  {fileNameFrom(url)}
                </span>
              </div>
            </React.Fragment>
          ))}

          {/* Drop indicator after last tile */}
          {reorderable && dropAt === urls.length && dragFromIdx !== null && dragFromIdx !== urls.length - 1 && (
            <div aria-hidden className="w-0.5 self-stretch rounded bg-primary" />
          )}

          {/* Integrated: "Add" tile embedded in the grid */}
          {panelLayout === 'integrated' && !disabled && (
            <button
              type="button"
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy
                ? <Loader2Icon className="size-6 animate-spin" />
                : <UploadIcon  className="size-6" />
              }
              <span className="text-xs">Add</span>
            </button>
          )}
        </div>
      )}

      {/* ── List layout ─────────────────────────────────────────────────── */}
      {!isGrid && urls.length > 0 && (
        <ul className="flex flex-col">
          {urls.map((url, i) => (
            <React.Fragment key={i}>
              {/* Drop indicator before row */}
              {reorderable && dropAt === i && dragFromIdx !== null && dragFromIdx !== i && dragFromIdx + 1 !== i && (
                <li aria-hidden className="h-0.5 rounded bg-primary mx-1" />
              )}
              <li
                className={[
                  'flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-sm',
                  i > 0 ? 'mt-1.5' : '',
                  dragFromIdx === i ? 'opacity-40' : '',
                ].join(' ')}
                draggable={reorderable}
                onDragStart={reorderable ? (e) => onDragStart(e, i) : undefined}
                onDragOver={reorderable  ? (e) => onItemDragOver(e, i) : undefined}
                onDragEnd={reorderable   ? onDragEnd : undefined}
                onDrop={reorderable      ? onDrop : undefined}
              >
                {reorderable && (
                  <GripVerticalIcon
                    className="size-4 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground"
                    aria-hidden
                  />
                )}
                {preview && isImage(url)
                  ? openable
                    ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" className="size-8 rounded object-cover shrink-0" />
                      </a>
                    )
                    : <img src={url} alt="" className="size-8 rounded object-cover shrink-0" />
                  : <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                }
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate hover:underline"
                >
                  {fileNameFrom(url)}
                </a>
                {downloadable && downloadBtn(url)}
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  aria-label="Remove file"
                >
                  <XIcon className="size-4" />
                </button>
              </li>
            </React.Fragment>
          ))}
          {/* Drop indicator after last row */}
          {reorderable && dropAt === urls.length && dragFromIdx !== null && dragFromIdx !== urls.length - 1 && (
            <li aria-hidden className="mt-1.5 h-0.5 rounded bg-primary mx-1" />
          )}
        </ul>
      )}

      {/* Max-size hint for integrated mode (no separate button row) */}
      {panelLayout === 'integrated' && maxSize !== undefined && (
        <p className="text-xs text-muted-foreground">Max {Math.round(maxSize / 1024)} KB</p>
      )}

      {/* ── Image editor modal ───────────────────────────────────────────── */}
      {editorState && (
        <Dialog open onOpenChange={(open) => { if (!open) handleEditorCancel() }}>
          <DialogContent className="max-w-2xl gap-4">
            <DialogHeader>
              <DialogTitle>Crop image</DialogTitle>
            </DialogHeader>

            {/* Aspect ratio picker */}
            {imageEditorAspectRatioOptions?.length && (
              <div className="flex flex-wrap gap-2">
                {imageEditorAspectRatioOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={[
                      'rounded border px-2.5 py-1 text-sm font-medium transition-colors',
                      activeRatio === opt.ratio
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted',
                    ].join(' ')}
                    onClick={() => onRatioChange(opt.ratio)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={[
                    'rounded border px-2.5 py-1 text-sm font-medium transition-colors',
                    activeRatio === undefined
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-muted',
                  ].join(' ')}
                  onClick={() => onRatioChange(undefined)}
                >
                  Free
                </button>
              </div>
            )}

            <div className="flex justify-center overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={setCrop}
                onComplete={setCompletedCrop}
                {...(activeRatio !== undefined ? { aspect: activeRatio } : {})}
                circularCrop={circleCropper}
              >
                <img
                  ref={imgRef}
                  src={editorState.src}
                  alt="Crop preview"
                  className="max-h-[55vh] max-w-full object-contain"
                  onLoad={onImgLoad}
                />
              </ReactCrop>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleEditorCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => { void handleEditorApply() }}
                disabled={!completedCrop?.width || !completedCrop?.height}
              >
                Apply crop
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * Draw a crop region from `img` onto a canvas and return the result as a Blob.
 * When `fromDisplay` is true, `pixelCrop` coordinates are in *display* pixels
 * (as returned by ReactCrop's onComplete); they are scaled to the image's
 * natural dimensions before drawing.
 */
function cropToBlob(
  img: HTMLImageElement,
  pixelCrop: PixelCrop,
  circular: boolean,
  fromDisplay: boolean,
): Promise<Blob> {
  const scaleX = fromDisplay ? img.naturalWidth  / img.width  : 1
  const scaleY = fromDisplay ? img.naturalHeight / img.height : 1
  const w = Math.round(pixelCrop.width  * scaleX)
  const h = Math.round(pixelCrop.height * scaleY)

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  if (circular) {
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
    ctx.clip()
  }

  ctx.drawImage(
    img,
    pixelCrop.x * scaleX, pixelCrop.y * scaleY,
    pixelCrop.width * scaleX, pixelCrop.height * scaleY,
    0, 0, w, h,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/webp', 0.92,
    )
  })
}

function isImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)
}

function fileNameFrom(url: string): string {
  try {
    const u = new URL(url, 'http://_')
    const p = u.pathname.split('/').filter(Boolean).pop()
    return p ?? url
  } catch {
    return url.split('/').filter(Boolean).pop() ?? url
  }
}
