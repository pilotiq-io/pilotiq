import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  UploadIcon, XIcon, FileIcon, Loader2Icon,
  GripVerticalIcon, DownloadIcon,
  FileImageIcon, FileVideoIcon, FileAudioIcon, FileTextIcon, FileArchiveIcon,
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
  preserveFilenames  = false,
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
  preserveFilenames?: boolean
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

  // Items are the source of truth: each is either an in-flight upload, a
  // stored (done) file, or a failed one. The committed form value is the
  // ordered list of done URLs — so reordering works across pending + done.
  const [items, setItems] = useState<UploadItem[]>(() => urlsToItems(toUrls(defaultValue)))
  const xhrRef = useRef<Map<string, XMLHttpRequest>>(new Map())

  const committedUrls = items.flatMap((i) => (i.status === 'done' && i.url ? [i.url] : []))
  const committedKey  = committedUrls.join('\n')
  const anyUploading  = items.some((i) => i.status === 'uploading')

  // Track the value we last synced so the push/pull effects below don't fight
  // (our own writes vs external mutations: suggestion applier / live resolve).
  const syncedKeyRef = useRef(committedKey)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const fsRef = useRef(fs)
  useEffect(() => { fsRef.current = fs }, [fs])

  // Push committed URLs → form state when they change locally.
  useEffect(() => {
    if (committedKey === syncedKeyRef.current) return
    syncedKeyRef.current = committedKey
    const stored = multiple ? committedUrls : (committedUrls[0] ?? null)
    const cur = fsRef.current
    if (cur.controlled) cur.setValue(stored)
    cur.triggerLive(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedKey, multiple])

  // Pull external form-state changes (controlled mode) → items.
  const externalKey = fs.controlled ? toUrls(fs.value).join('\n') : committedKey
  useEffect(() => {
    if (!fs.controlled) return
    if (externalKey === syncedKeyRef.current) return
    syncedKeyRef.current = externalKey
    setItems((prev) => {
      prev.forEach((i) => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) })
      return urlsToItems(externalKey ? externalKey.split('\n') : [])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalKey])

  // Abort in-flight uploads + revoke object URLs on unmount.
  useEffect(() => {
    const xhrs = xhrRef.current
    return () => {
      xhrs.forEach((x) => x.abort()); xhrs.clear()
      itemsRef.current.forEach((i) => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) })
    }
  }, [])

  // Cross-tree applier — FileUpload state lives in `items` (React); the
  // hidden mirror input is write-only. FieldShell skips its generic
  // registration for fieldType === 'fileUpload'.
  const formId = useContext(FormIdContext) || undefined
  useEffect(() => {
    if (name.includes('.')) return
    const applier: PendingSuggestionApplier = (suggestion) => {
      const next = toUrls(suggestion.suggestedValue)
      setItems((prev) => {
        prev.forEach((i) => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) })
        return urlsToItems(next)
      })
    }
    return registerPendingSuggestionApplier(formId, name, applier)
  }, [name, formId])

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

  const buildUploadBody = (file: File): FormData => {
    const fd = new FormData()
    fd.append('file', file)
    if (directory) fd.append('directory', directory)
    if (accept)    fd.append('accept', accept.join(','))
    if (maxSize !== undefined) fd.append('maxSize', String(maxSize))
    if (automaticallyResize) {
      fd.append('resize_width',  String(automaticallyResize.width))
      fd.append('resize_height', String(automaticallyResize.height))
    }
    fd.append('fieldName', name)
    if (preserveFilenames) fd.append('preserveFilenames', 'true')
    return fd
  }

  // Fire one upload via XHR (for real upload-progress events) and stream its
  // state into `items`. Not awaited by the caller — uploads run in parallel.
  const startUpload = (file: File): void => {
    if (!uploadUrl) return
    const id = uploadId()
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    setItems((prev) => [...prev, {
      id, status: 'uploading', name: file.name, mime: file.type, progress: 0,
      ...(previewUrl ? { previewUrl } : {}),
    }])

    const fail = (msg: string): void => {
      xhrRef.current.delete(id)
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: 'error', error: msg } : it))
      notify({ type: 'error', title: 'Upload failed', body: msg })
    }

    const xhr = new XMLHttpRequest()
    xhrRef.current.set(id, xhr)
    xhr.upload.onprogress = (e): void => {
      if (!e.lengthComputable) return
      const pct = Math.round((e.loaded / e.total) * 100)
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, progress: pct } : it))
    }
    xhr.onload = (): void => {
      xhrRef.current.delete(id)
      let json: { ok?: boolean; url?: string; error?: string } = {}
      try { json = JSON.parse(xhr.responseText) as typeof json } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && json.ok && json.url) {
        const url = json.url
        setItems((prev) => prev.map((it) => {
          if (it.id !== id) return it
          if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
          return {
            id: it.id, status: 'done', name: it.name, url, progress: 100,
            ...(it.mime ? { mime: it.mime } : {}),
          }
        }))
      } else {
        fail(json.error ?? `HTTP ${xhr.status}`)
      }
    }
    xhr.onerror = (): void => fail('Network error')
    xhr.open('POST', uploadUrl)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.send(buildUploadBody(file))
  }

  const onPick = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    if (!uploadUrl) {
      notify({ type: 'error', title: 'Upload URL missing', body: 'Pilotiq panel has no upload route configured.' })
      return
    }
    const single = !multiple && !appendFiles
    if (single) {
      // Replace any existing / in-flight items.
      xhrRef.current.forEach((x) => x.abort()); xhrRef.current.clear()
      setItems((prev) => { prev.forEach((i) => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) }); return [] })
    }
    // The crop editor must run one modal at a time, so prepare sequentially;
    // each upload itself fires in parallel (startUpload is not awaited).
    for (const file of Array.from(files)) {
      let prepared: File
      try { prepared = await prepareFile(file) } catch { continue } // editor cancelled
      startUpload(prepared)
      if (single) break
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeAt = (i: number): void => {
    setItems((prev) => {
      const it = prev[i]
      if (it) {
        const xhr = xhrRef.current.get(it.id)
        if (xhr) { xhr.abort(); xhrRef.current.delete(it.id) }
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
      }
      return prev.filter((_, idx) => idx !== i)
    })
  }

  // ── File drop-zone (add files by dragging onto the field) ──────────────────
  const [fileDragOver, setFileDragOver] = useState(false)
  const isFileDrag = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes('Files')
  const onZoneDragOver = (e: React.DragEvent): void => {
    if (disabled || !isFileDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setFileDragOver(true)
  }
  const onZoneDragLeave = (e: React.DragEvent): void => {
    if (e.currentTarget === e.target) setFileDragOver(false)
  }
  const onZoneDrop = (e: React.DragEvent): void => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return // internal reorder
    e.preventDefault()
    setFileDragOver(false)
    void onPick(e.dataTransfer.files)
  }

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

  const onItemReorderDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    if (dragFromIdx == null || dropAt == null) { onDragEnd(); return }
    const next = reorderRows(items, dragFromIdx, dropAt)
    if (next !== items) setItems(next)
    onDragEnd()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hiddenValue = multiple ? JSON.stringify(committedUrls) : (committedUrls[0] ?? '')
  const isGrid      = panelLayout === 'grid' || panelLayout === 'integrated'

  // ── Shared sub-renders ────────────────────────────────────────────────────

  // The image source for an item: stored URL when done (if it's an image and
  // previews are on), or the local object-URL preview while uploading/failed.
  const itemImageSrc = (item: UploadItem): string | undefined =>
    item.status === 'done'
      ? (preview && item.url && isImage(item.url) ? item.url : undefined)
      : item.previewUrl

  const gridThumb = (item: UploadItem): React.ReactElement => {
    const src = itemImageSrc(item)
    if (src) return <img src={src} alt="" className="size-full object-cover" />
    const Icon = fileIconFor(item.mime, item.name)
    return <Icon className="size-8 text-muted-foreground" />
  }

  const listThumb = (item: UploadItem): React.ReactElement => {
    const src = itemImageSrc(item)
    if (src) return <img src={src} alt="" className="size-8 rounded object-cover shrink-0" />
    const Icon = fileIconFor(item.mime, item.name)
    return <Icon className="size-4 shrink-0 text-muted-foreground" />
  }

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
    <div
      className={['flex flex-col gap-2 rounded-md', fileDragOver ? 'ring-2 ring-primary ring-offset-2' : ''].join(' ')}
      onDragOver={onZoneDragOver}
      onDragLeave={onZoneDragLeave}
      onDrop={onZoneDrop}
    >
      <input type="hidden" name={name} value={hiddenValue} readOnly />

      {/* Upload trigger — hidden in integrated mode (button lives inside the grid) */}
      {panelLayout !== 'integrated' && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            {anyUploading
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
      {isGrid && (items.length > 0 || panelLayout === 'integrated') && (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <React.Fragment key={item.id}>
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
                onDrop={reorderable      ? onItemReorderDrop : undefined}
              >
                {/* Thumbnail tile */}
                <div className={[
                  'relative size-20 rounded-md border bg-muted overflow-hidden flex items-center justify-center',
                  item.status === 'error' ? 'border-destructive' : 'border-input',
                ].join(' ')}>
                  {openable && item.url
                    ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="size-full block">
                        {gridThumb(item)}
                      </a>
                    )
                    : gridThumb(item)
                  }
                  {/* Per-file upload progress */}
                  {item.status === 'uploading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                      <CircularProgress value={item.progress ?? 0} />
                    </div>
                  )}
                  {/* Hover overlay — actions (not while uploading) */}
                  {item.status !== 'uploading' && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                      {downloadable && item.url && (
                        <a
                          href={item.url}
                          download={fileNameFrom(item.url)}
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
                  )}
                </div>
                <span className={[
                  'w-20 truncate text-center text-xs',
                  item.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                ].join(' ')}>
                  {item.status === 'error' ? (item.error ?? 'Failed') : (item.url ? fileNameFrom(item.url) : item.name)}
                </span>
              </div>
            </React.Fragment>
          ))}

          {/* Drop indicator after last tile */}
          {reorderable && dropAt === items.length && dragFromIdx !== null && dragFromIdx !== items.length - 1 && (
            <div aria-hidden className="w-0.5 self-stretch rounded bg-primary" />
          )}

          {/* Integrated: "Add" tile embedded in the grid */}
          {panelLayout === 'integrated' && !disabled && (
            <button
              type="button"
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              {anyUploading
                ? <Loader2Icon className="size-6 animate-spin" />
                : <UploadIcon  className="size-6" />
              }
              <span className="text-xs">Add</span>
            </button>
          )}
        </div>
      )}

      {/* ── List layout ─────────────────────────────────────────────────── */}
      {!isGrid && items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((item, i) => (
            <React.Fragment key={item.id}>
              {/* Drop indicator before row */}
              {reorderable && dropAt === i && dragFromIdx !== null && dragFromIdx !== i && dragFromIdx + 1 !== i && (
                <li aria-hidden className="h-0.5 rounded bg-primary mx-1" />
              )}
              <li
                className={[
                  'flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm',
                  item.status === 'error' ? 'border-destructive' : 'border-input',
                  i > 0 ? 'mt-1.5' : '',
                  dragFromIdx === i ? 'opacity-40' : '',
                ].join(' ')}
                draggable={reorderable}
                onDragStart={reorderable ? (e) => onDragStart(e, i) : undefined}
                onDragOver={reorderable  ? (e) => onItemDragOver(e, i) : undefined}
                onDragEnd={reorderable   ? onDragEnd : undefined}
                onDrop={reorderable      ? onItemReorderDrop : undefined}
              >
                {reorderable && (
                  <GripVerticalIcon
                    className="size-4 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground"
                    aria-hidden
                  />
                )}
                {item.status === 'uploading'
                  ? <span className="shrink-0 text-primary"><CircularProgress value={item.progress ?? 0} /></span>
                  : openable && item.url
                    ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {listThumb(item)}
                      </a>
                    )
                    : listThumb(item)
                }
                {item.url
                  ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate hover:underline"
                    >
                      {fileNameFrom(item.url)}
                    </a>
                  )
                  : (
                    <span className={[
                      'flex-1 truncate',
                      item.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                    ].join(' ')}>
                      {item.status === 'error' ? (item.error ?? 'Upload failed') : item.name}
                    </span>
                  )
                }
                {downloadable && item.url && downloadBtn(item.url)}
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
          {reorderable && dropAt === items.length && dragFromIdx !== null && dragFromIdx !== items.length - 1 && (
            <li aria-hidden className="mt-1.5 h-0.5 rounded bg-primary mx-1" />
          )}
        </ul>
      )}

      {/* Empty-state dropzone (non-integrated; integrated has its own Add tile) */}
      {items.length === 0 && !disabled && panelLayout !== 'integrated' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={[
            'flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-sm transition-colors',
            fileDragOver
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-input text-muted-foreground hover:border-primary',
          ].join(' ')}
        >
          <UploadIcon className="size-5" />
          <span>Drag &amp; drop {multiple ? 'files' : 'a file'} here, or click to browse</span>
        </button>
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

/** One entry in the field: an in-flight upload, a stored file, or a failure. */
interface UploadItem {
  id:          string
  status:      'uploading' | 'done' | 'error'
  name:        string
  url?:        string   // present once done
  previewUrl?: string   // local object-URL while uploading (images)
  mime?:       string
  progress?:   number   // 0..100 while uploading
  error?:      string
}

function uploadId(): string {
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Seed done-items from already-stored URLs (initial / external value). */
function urlsToItems(urls: string[]): UploadItem[] {
  return urls.map((url, i) => ({
    id:     `seed-${i}-${url}`,
    status: 'done',
    name:   fileNameFrom(url),
    url,
  }))
}

/** Pick a type-appropriate icon for a non-previewable file. */
function fileIconFor(
  mime: string | undefined,
  name: string,
): React.ComponentType<{ className?: string }> {
  const m   = (mime ?? '').toLowerCase()
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (m.startsWith('image/'))                                              return FileImageIcon
  if (m.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return FileVideoIcon
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return FileAudioIcon
  if (m === 'application/pdf' || ext === 'pdf')                            return FileTextIcon
  if (m.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'yml', 'yaml', 'html'].includes(ext)) return FileTextIcon
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext))                    return FileArchiveIcon
  return FileIcon
}

/** Small SVG progress ring (0..100), inheriting `currentColor`. */
function CircularProgress({ value }: { value: number }): React.ReactElement {
  const r = 9
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const offset = c * (1 - pct / 100)
  return (
    <svg viewBox="0 0 24 24" className="size-7 -rotate-90" role="progressbar" aria-valuenow={pct}>
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth="2.5" />
      <circle
        cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 150ms linear' }}
      />
    </svg>
  )
}
