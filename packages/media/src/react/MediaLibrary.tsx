'use client'

/**
 * The media library browser — the React widget mounted by `MediaLibraryPage`
 * via a `View` element. Owns the whole UI and talks to the `_media` routes
 * directly (`mediaClient.ts`). Functional core: folder browsing + breadcrumbs,
 * upload (with per-file progress, click or drag-drop), new-folder, delete, and
 * a type-aware preview modal driven by the extensible preview registry.
 *
 * Richer interactions (list view, rename/move context menu, multi-select,
 * directory drops) are tracked as a follow-up.
 *
 * Two modes:
 *  - `'manage'` (default) — the standalone library page: click a file to
 *    preview it, per-tile delete, etc.
 *  - `'select'` — embedded in the `MediaField` picker dialog: clicking a file
 *    selects it (single → fires `onSelect` immediately; multiple → toggles,
 *    confirmed via the footer button). Per-tile delete is hidden.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaRecord } from '../types.js'
import { categorize } from '../types.js'
import { resolveMediaPreview } from '../preview/registry.js'
import { registerBuiltinMediaPreviews } from '../preview/builtins.js'
import {
  deriveApiBase,
  listMedia,
  createFolder,
  deleteMedia,
  uploadMedia,
  renameMedia,
  moveMedia,
} from './mediaClient.js'

// Safety net — ensures the built-in previews exist even if the host's
// client entry forgot to call it (idempotent).
registerBuiltinMediaPreviews()

interface Crumb { id: string; name: string }
interface ActiveUpload { id: string; name: string; progress: number; error?: string }

const VIEW_KEY = 'pilotiq.media.view'
/** Seed the grid/list preference from localStorage (SSR-safe). */
function readView(): 'grid' | 'list' {
  if (typeof window === 'undefined') return 'grid'
  try { return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

// Custom drag MIME for internal drag-to-folder moves (so they don't collide
// with external OS file / URL drops, which carry `Files` / `text/uri-list`).
const DND_MIME = 'application/x-pilotiq-media-id'

/** Minimal FileSystemEntry shape (the `webkitGetAsEntry` tree) — typed locally
 *  since lib.dom's `FileSystemEntry` types aren't always in scope. */
interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void
  createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void }
}

/** Read every entry from a directory reader (`readEntries` is paginated). */
async function readAllEntries(reader: { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void }): Promise<FsEntry[]> {
  const out: FsEntry[] = []
  for (;;) {
    const batch = await new Promise<FsEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (batch.length === 0) break
    out.push(...batch)
  }
  return out
}

/** Recursively upload a dropped FileSystemEntry tree under `parentId`,
 *  recreating folders. Per-file failures bubble up to abort the import. */
async function importEntry(entry: FsEntry, parentId: string | null, apiBase: string, library: string | undefined): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej))
    await uploadMedia(apiBase, file, { parentId, ...(library ? { library } : {}) })
  } else if (entry.isDirectory && entry.createReader) {
    const folder = await createFolder(apiBase, entry.name, parentId)
    const children = await readAllEntries(entry.createReader())
    for (const child of children) await importEntry(child, folder.id, apiBase, library)
  }
}

/** Fetch a dragged URL and wrap it as a `File` for upload. */
async function fetchUrlAsFile(url: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
  const blob = await res.blob()
  const path = url.split('?')[0] ?? url
  const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || 'download')
  return new File([blob], name, { type: blob.type || 'application/octet-stream' })
}

/** Config the `Media` schema element / library page passes through the `View`
 *  widget's resolved `data` payload (parallel to the direct props the picker
 *  dialog passes). */
interface MediaViewData {
  apiBase?:   string
  library?:   string
  directory?: string
  height?:    number
}

/** Drag-to-folder move handlers, threaded into tiles / rows (manage mode). */
interface DndHandlers {
  onItemDragStart:   (e: React.DragEvent, rec: MediaRecord) => void
  onFolderDragOver:  (e: React.DragEvent, rec: MediaRecord) => void
  onFolderDragLeave: (e: React.DragEvent, rec: MediaRecord) => void
  onDropOnFolder:    (e: React.DragEvent, rec: MediaRecord) => void
  dropFolderId:      string | null
}

export interface MediaLibraryProps {
  /** Resolved `View` server data when mounted as a widget (library page or the
   *  `Media` schema element). Carries apiBase / library / directory / height. */
  data?:      unknown
  /** `'manage'` (page) or `'select'` (picker dialog). Default `'manage'`. */
  mode?:      'manage' | 'select'
  /** In select mode, allow picking more than one file. */
  multiple?:  boolean
  /** Fired with the chosen records in select mode. */
  onSelect?:  (records: MediaRecord[]) => void
  /** Override the derived `_media` API base (the field passes the panel base;
   *  the page-relative `deriveApiBase` would be wrong inside a form). */
  apiBase?:   string
  /** Scope uploads to a named library (from the `Media` element). */
  library?:   string
  /** Root the browser at a folder id (from the `Media` element). */
  directory?: string
}

export function MediaLibrary({
  data,
  mode = 'manage',
  multiple = false,
  onSelect,
  apiBase:   apiBaseProp,
  library:   libraryProp,
  directory: directoryProp,
}: MediaLibraryProps = {}): React.JSX.Element {
  // Direct props (picker dialog) win; otherwise read the View `data` payload.
  const cfg = (data && typeof data === 'object') ? data as MediaViewData : {}
  const apiBaseResolved = apiBaseProp   ?? cfg.apiBase
  const library         = libraryProp   ?? cfg.library
  const initialFolder   = directoryProp ?? cfg.directory ?? null
  const minHeight       = cfg.height
  const apiBase = useMemo(() => apiBaseResolved ?? deriveApiBase('media'), [apiBaseResolved])
  const selecting = mode === 'select'

  const [folderId, setFolderId] = useState<string | null>(initialFolder)
  const [trail, setTrail] = useState<Crumb[]>([])
  const [items, setItems] = useState<MediaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uploads, setUploads] = useState<ActiveUpload[]>([])
  const [preview, setPreview] = useState<MediaRecord | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Folder currently hovered as a drag-to-move drop target (highlight).
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  // Select-mode multi-select buffer, keyed by id (preserves clicked records
  // so the footer "Add" can return them even after navigating folders away).
  const [selected, setSelected] = useState<Record<string, MediaRecord>>({})
  // Grid ⇄ list view, persisted across sessions. Initialized to 'grid' to match
  // SSR (localStorage is client-only), then the stored preference is applied in
  // a mount effect — avoids a hydration mismatch on the toggle.
  const [view, setView] = useState<'grid' | 'list'>('grid')
  useEffect(() => { setView(readView()) }, [])
  // Per-item right-click context menu (manage mode only).
  const [menu, setMenu] = useState<{ rec: MediaRecord; x: number; y: number } | null>(null)
  // Rename dialog (the item being renamed, or null).
  const [renaming, setRenaming] = useState<MediaRecord | null>(null)
  // Move dialog targets — one (context menu) or many (bulk). null = closed.
  const [moveTargets, setMoveTargets] = useState<MediaRecord[] | null>(null)
  // Manage-mode multi-select buffer (distinct from `selected`, which is the
  // picker dialog's). `lastMarkedRef` anchors shift-click range selection.
  const [marked, setMarked] = useState<Record<string, MediaRecord>>({})
  const lastMarkedRef = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const chooseView = useCallback((v: 'grid' | 'list') => {
    setView(v)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
  }, [])

  const load = useCallback(async (parentId: string | null, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listMedia(apiBase, { parentId, search: q, perPage: 100 })
      setItems(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  // Reload on folder change; debounce search.
  useEffect(() => {
    const t = setTimeout(() => { void load(folderId, search) }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [folderId, search, load])

  const openFolder = useCallback((rec: MediaRecord) => {
    setSearch('')
    setTrail(t => [...t, { id: rec.id, name: rec.name }])
    setFolderId(rec.id)
  }, [])

  const goTo = useCallback((index: number) => {
    // index -1 = root
    setSearch('')
    if (index < 0) { setTrail([]); setFolderId(null); return }
    setTrail(t => t.slice(0, index + 1))
    setFolderId(trail[index]?.id ?? null)
  }, [trail])

  const runUploads = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const queued: ActiveUpload[] = files.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, name: f.name, progress: 0 }))
    setUploads(u => [...u, ...queued])
    await Promise.all(files.map(async (file, i) => {
      const u = queued[i]!
      try {
        await uploadMedia(apiBase, file, {
          parentId: folderId,
          ...(library ? { library } : {}),
          onProgress: p => setUploads(list => list.map(x => x.id === u.id ? { ...x, progress: p } : x)),
        })
      } catch (err) {
        setUploads(list => list.map(x => x.id === u.id ? { ...x, error: err instanceof Error ? err.message : 'Failed' } : x))
      }
    }))
    // Clear finished uploads after a beat, then refresh.
    setTimeout(() => setUploads(list => list.filter(x => x.error)), 1200)
    await load(folderId, search)
  }, [apiBase, folderId, search, load, library])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void runUploads(files)
  }, [runUploads])

  // Drop onto the browser background: directory trees (webkitGetAsEntry),
  // plain files, or a dragged URL (fetched → uploaded).
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    const dt = e.dataTransfer

    // 1. Directory entries — recurse, recreating the folder structure.
    const entries = dt.items
      ? Array.from(dt.items).map(it => (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null).filter(Boolean) as FsEntry[]
      : []
    if (entries.some(en => en.isDirectory)) {
      const id = `dir-${Date.now()}`
      setUploads(u => [...u, { id, name: 'Importing folder…', progress: 0 }])
      try {
        for (const en of entries) await importEntry(en, folderId, apiBase, library)
        setUploads(list => list.filter(x => x.id !== id))
      } catch (err) {
        setUploads(list => list.map(x => x.id === id ? { ...x, error: err instanceof Error ? err.message : 'Import failed' } : x))
        setTimeout(() => setUploads(list => list.filter(x => x.error)), 1500)
      }
      await load(folderId, search)
      return
    }

    // 2. Plain files.
    const files = Array.from(dt.files)
    if (files.length) { void runUploads(files); return }

    // 3. A dragged URL (e.g. an image from another tab).
    const url = (dt.getData('text/uri-list') || dt.getData('text/plain')).trim()
    if (/^https?:\/\//i.test(url)) {
      const id = `url-${Date.now()}`
      setUploads(u => [...u, { id, name: url.split('/').pop() || url, progress: 0 }])
      try {
        const file = await fetchUrlAsFile(url)
        setUploads(list => list.filter(x => x.id !== id))
        void runUploads([file])
      } catch (err) {
        setUploads(list => list.map(x => x.id === id ? { ...x, error: err instanceof Error ? err.message : 'URL import failed' } : x))
        setTimeout(() => setUploads(list => list.filter(x => x.error)), 1500)
      }
    }
  }, [apiBase, folderId, search, library, load, runUploads])

  // Drag a tile/row onto a folder to reparent it. Internal drags carry our
  // custom MIME so they don't collide with external file/URL drops.
  const onItemDragStart = useCallback((e: React.DragEvent, rec: MediaRecord) => {
    e.dataTransfer.setData(DND_MIME, rec.id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDropOnFolder = useCallback(async (e: React.DragEvent, folder: MediaRecord) => {
    const id = e.dataTransfer.getData(DND_MIME)
    if (!id || id === folder.id || folder.type !== 'folder') return
    e.preventDefault(); e.stopPropagation()
    setDropFolderId(null)
    try {
      await moveMedia(apiBase, id, folder.id)
      setMarked({})
      await load(folderId, search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    }
  }, [apiBase, folderId, search, load])

  const onFolderDragOver = useCallback((e: React.DragEvent, folder: MediaRecord) => {
    if (folder.type !== 'folder' || !e.dataTransfer.types.includes(DND_MIME)) return
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropFolderId(folder.id)
  }, [])

  const onFolderDragLeave = useCallback((_e: React.DragEvent, folder: MediaRecord) => {
    setDropFolderId(cur => (cur === folder.id ? null : cur))
  }, [])

  const dnd = useMemo<DndHandlers | null>(
    () => (selecting ? null : { onItemDragStart, onFolderDragOver, onFolderDragLeave, onDropOnFolder, dropFolderId }),
    [selecting, onItemDragStart, onFolderDragOver, onFolderDragLeave, onDropOnFolder, dropFolderId],
  )

  const onDelete = useCallback(async (rec: MediaRecord) => {
    const label = rec.type === 'folder' ? `folder "${rec.name}" and everything in it` : `"${rec.name}"`
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    try {
      await deleteMedia(apiBase, rec.id)
      if (preview?.id === rec.id) setPreview(null)
      await load(folderId, search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }, [apiBase, folderId, search, load, preview])

  // ── Manage-mode multi-select ───────────────────────────────────────────────
  const toggleMark = useCallback((rec: MediaRecord) => {
    setMarked(prev => {
      const next = { ...prev }
      if (next[rec.id]) delete next[rec.id]; else next[rec.id] = rec
      return next
    })
    lastMarkedRef.current = rec.id
  }, [])

  const rangeMark = useCallback((rec: MediaRecord) => {
    const ids = items.map(i => i.id)
    const from = ids.indexOf(lastMarkedRef.current ?? rec.id)
    const to = ids.indexOf(rec.id)
    if (from < 0 || to < 0) { toggleMark(rec); return }
    const [lo, hi] = from < to ? [from, to] : [to, from]
    setMarked(prev => {
      const next = { ...prev }
      for (let i = lo; i <= hi; i++) { const it = items[i]; if (it) next[it.id] = it }
      return next
    })
  }, [items, toggleMark])

  const onActivate = useCallback((rec: MediaRecord, e?: React.MouseEvent) => {
    // Manage mode: modifier-clicks drive multi-select instead of activating.
    if (!selecting) {
      if (e && (e.metaKey || e.ctrlKey)) { toggleMark(rec); return }
      if (e && e.shiftKey) { rangeMark(rec); return }
      // A plain click clears any marks, then activates.
      setMarked(m => (Object.keys(m).length ? {} : m))
    }
    if (rec.type === 'folder') { openFolder(rec); return }
    if (selecting) {
      if (!multiple) { onSelect?.([rec]); return }
      setSelected(prev => {
        const next = { ...prev }
        if (next[rec.id]) delete next[rec.id]
        else next[rec.id] = rec
        return next
      })
      return
    }
    setPreview(rec)
  }, [openFolder, selecting, multiple, onSelect, toggleMark, rangeMark])

  const selectedList = useMemo(() => Object.values(selected), [selected])
  const confirmSelection = useCallback(() => {
    if (selectedList.length > 0) onSelect?.(selectedList)
  }, [selectedList, onSelect])

  const markedList = useMemo(() => Object.values(marked), [marked])
  const clearMarks = useCallback(() => setMarked({}), [])

  const bulkDelete = useCallback(async () => {
    const list = Object.values(marked)
    if (list.length === 0) return
    if (!window.confirm(`Delete ${list.length} item${list.length > 1 ? 's' : ''}? This cannot be undone.`)) return
    try {
      await Promise.all(list.map(r => deleteMedia(apiBase, r.id)))
      setMarked({})
      await load(folderId, search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed')
    }
  }, [marked, apiBase, folderId, search, load])

  // Right-click → context menu (manage mode only; the picker doesn't manage).
  const onContextMenu = useCallback((e: React.MouseEvent, rec: MediaRecord) => {
    if (selecting) return
    e.preventDefault()
    setMenu({ rec, x: e.clientX, y: e.clientY })
  }, [selecting])

  const onRename = useCallback(async (rec: MediaRecord, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === rec.name) { setRenaming(null); return }
    try {
      await renameMedia(apiBase, rec.id, trimmed)
      setRenaming(null)
      await load(folderId, search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    }
  }, [apiBase, folderId, search, load])

  const onMove = useCallback(async (recs: MediaRecord[], destId: string | null) => {
    const toMove = recs.filter(r => r.parentId !== destId && r.id !== destId)
    setMoveTargets(null)
    if (toMove.length === 0) return
    try {
      await Promise.all(toMove.map(r => moveMedia(apiBase, r.id, destId)))
      setMarked({})
      await load(folderId, search)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    }
  }, [apiBase, folderId, search, load])

  return (
    <div
      className={`flex min-h-[28rem] flex-col rounded-lg border ${dragging ? 'ring-2 ring-primary' : ''}`}
      style={minHeight !== undefined ? { minHeight } : undefined}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { e.preventDefault(); if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={onDrop}
    >
      {/* Header: breadcrumbs + actions */}
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <CrumbButton active={trail.length === 0} onClick={() => goTo(-1)}>Media</CrumbButton>
          {trail.map((c, i) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1">
              <span className="shrink-0 text-muted-foreground">/</span>
              <CrumbButton active={i === trail.length - 1} onClick={() => goTo(i)}>{c.name}</CrumbButton>
            </span>
          ))}
        </nav>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {/* Grid / list view toggle */}
        <div className="flex items-center rounded-md border p-0.5">
          <button
            onClick={() => chooseView('grid')}
            className={`flex h-7 w-7 items-center justify-center rounded ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
          >
            <GridIcon />
          </button>
          <button
            onClick={() => chooseView('list')}
            className={`flex h-7 w-7 items-center justify-center rounded ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <ListIcon />
          </button>
        </div>
        <button onClick={() => setNewFolderOpen(true)} className="h-8 rounded-md border px-3 text-sm hover:bg-muted">
          New folder
        </button>
        <button onClick={() => fileInput.current?.click()} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
          Upload
        </button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={onPick} />
      </header>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-1.5 border-b bg-muted/30 px-4 py-2">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 text-xs">
              <span className="w-40 truncate text-muted-foreground">{u.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${u.error ? 'bg-destructive' : 'bg-primary'} transition-all`}
                  style={{ width: `${u.error ? 100 : Math.round(u.progress * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-muted-foreground">
                {u.error ? u.error : `${Math.round(u.progress * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bulk-action toolbar (manage mode, when items are marked). */}
      {!selecting && markedList.length > 0 && (
        <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{markedList.length} selected</span>
          <button onClick={() => setMoveTargets(markedList)} className="h-7 rounded-md border bg-background px-2.5 hover:bg-muted">Move</button>
          <button onClick={() => { void bulkDelete() }} className="h-7 rounded-md border bg-background px-2.5 text-destructive hover:bg-destructive/10">Delete</button>
          <button onClick={clearMarks} className="ml-auto text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 p-4">
        {error && <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        {loading ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState dragging={dragging} onUpload={() => fileInput.current?.click()} />
        ) : view === 'list' ? (
          <MediaListView
            items={items}
            onActivate={onActivate}
            onContextMenu={onContextMenu}
            selectable={selecting}
            selected={selected}
            marked={marked}
            dnd={dnd}
            {...(selecting ? {} : { onToggleMark: toggleMark })}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
            {items.map(item => (
              <Tile
                key={item.id}
                item={item}
                onActivate={onActivate}
                onDelete={onDelete}
                onContextMenu={onContextMenu}
                selectable={selecting}
                selected={!!selected[item.id]}
                marked={!!marked[item.id]}
                dnd={dnd}
                {...(selecting ? {} : { onToggleMark: toggleMark })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Select-mode footer — confirm multi-select. */}
      {selecting && multiple && (
        <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {selectedList.length === 0 ? 'No files selected' : `${selectedList.length} selected`}
          </span>
          <button
            onClick={confirmSelection}
            disabled={selectedList.length === 0}
            className="h-8 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Add {selectedList.length > 0 ? selectedList.length : ''} to field
          </button>
        </footer>
      )}

      {/* Preview modal — manage mode only (select mode clicks pick, not preview). */}
      {!selecting && preview && <PreviewModal record={preview} onClose={() => setPreview(null)} onDelete={onDelete} />}
      {newFolderOpen && (
        <NewFolderDialog
          onClose={() => setNewFolderOpen(false)}
          onCreate={async name => {
            try {
              await createFolder(apiBase, name, folderId)
              setNewFolderOpen(false)
              await load(folderId, search)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create folder')
            }
          }}
        />
      )}

      {/* Per-item context menu (rename / move / download / delete). */}
      {menu && (
        <ContextMenu
          item={menu.rec}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => { setRenaming(menu.rec); setMenu(null) }}
          onMove={() => { setMoveTargets([menu.rec]); setMenu(null) }}
          onDelete={() => { const r = menu.rec; setMenu(null); void onDelete(r) }}
        />
      )}
      {renaming && (
        <RenameDialog
          item={renaming}
          onClose={() => setRenaming(null)}
          onSubmit={name => { void onRename(renaming, name) }}
        />
      )}
      {moveTargets && moveTargets.length > 0 && (
        <MoveDialog
          apiBase={apiBase}
          items={moveTargets}
          onClose={() => setMoveTargets(null)}
          onMove={destId => { void onMove(moveTargets, destId) }}
        />
      )}
    </div>
  )
}

// ── Tile ─────────────────────────────────────────────────
function thumbFor(rec: MediaRecord): string | null {
  if (rec.type !== 'file' || !(rec.mime ?? '').startsWith('image/')) return null
  const thumb = rec.conversions.find(c => c.name === 'thumb' && c.url)
  return thumb?.url ?? rec.url ?? null
}

function Tile({ item, onActivate, onDelete, onContextMenu, selectable = false, selected = false, marked = false, onToggleMark, dnd }: {
  item: MediaRecord
  onActivate: (r: MediaRecord, e?: React.MouseEvent) => void
  onDelete: (r: MediaRecord) => void
  onContextMenu?: (e: React.MouseEvent, r: MediaRecord) => void
  selectable?: boolean
  selected?: boolean
  marked?: boolean
  onToggleMark?: (r: MediaRecord) => void
  dnd?: DndHandlers | null
}) {
  const thumb = thumbFor(item)
  const isFile = item.type === 'file'
  const isFolder = item.type === 'folder'
  const dropActive = !!dnd && dnd.dropFolderId === item.id
  return (
    <div
      className={`group relative rounded-lg ${dropActive ? 'ring-2 ring-primary ring-offset-1' : ''}`}
      draggable={!!dnd}
      onDragStart={dnd ? e => dnd.onItemDragStart(e, item) : undefined}
      onContextMenu={onContextMenu ? e => onContextMenu(e, item) : undefined}
      {...(isFolder && dnd ? {
        onDragOver:  (e: React.DragEvent) => dnd.onFolderDragOver(e, item),
        onDragLeave: (e: React.DragEvent) => dnd.onFolderDragLeave(e, item),
        onDrop:      (e: React.DragEvent) => dnd.onDropOnFolder(e, item),
      } : {})}
    >
      <button
        onDoubleClick={e => onActivate(item, e)}
        onClick={e => onActivate(item, e)}
        aria-pressed={selectable && isFile ? selected : undefined}
        className={[
          'flex w-full flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:border-primary/50 hover:bg-muted/50',
          (selected || marked) ? 'border-primary ring-2 ring-primary' : '',
        ].join(' ')}
        title={item.name}
      >
        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-muted">
          {item.type === 'folder' ? <FolderGlyph /> : thumb ? (
            <img src={thumb} alt={item.name} className="h-full w-full object-cover" />
          ) : <FileGlyph category={categorize(item.mime)} />}
        </div>
        <span className="w-full truncate text-xs">{item.name}</span>
      </button>
      {/* Selected check badge (picker select mode). */}
      {selected && (
        <span
          aria-hidden
          className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm"
        >
          ✓
        </span>
      )}
      {/* Multi-select checkbox (manage mode) — visible on hover or when marked. */}
      {onToggleMark && (
        <input
          type="checkbox"
          checked={marked}
          onClick={e => e.stopPropagation()}
          onChange={() => onToggleMark(item)}
          aria-label={`Select ${item.name}`}
          className={`absolute left-1.5 top-1.5 h-4 w-4 cursor-pointer accent-primary ${marked ? '' : 'opacity-0 group-hover:opacity-100'}`}
        />
      )}
      {/* Delete — hidden in select mode (the picker shouldn't manage files). */}
      {!selectable && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(item) }}
          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm hover:text-destructive group-hover:flex"
          title="Delete"
          aria-label={`Delete ${item.name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── List view ────────────────────────────────────────────
function MediaListView({ items, onActivate, onContextMenu, selectable, selected, marked, onToggleMark, dnd }: {
  items: MediaRecord[]
  onActivate: (r: MediaRecord, e?: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, r: MediaRecord) => void
  selectable: boolean
  selected: Record<string, MediaRecord>
  marked: Record<string, MediaRecord>
  onToggleMark?: (r: MediaRecord) => void
  dnd?: DndHandlers | null
}) {
  const showCheck = !!onToggleMark
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {showCheck && <th className="w-8 px-2 py-1.5" />}
          <th className="px-2 py-1.5 font-medium">Name</th>
          <th className="px-2 py-1.5 font-medium">Type</th>
          <th className="px-2 py-1.5 font-medium">Size</th>
          <th className="px-2 py-1.5 font-medium">Modified</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const thumb = thumbFor(item)
          const isSel = !!selected[item.id]
          const isMarked = !!marked[item.id]
          const isFolder = item.type === 'folder'
          const dropActive = !!dnd && dnd.dropFolderId === item.id
          return (
            <tr
              key={item.id}
              onClick={e => onActivate(item, e)}
              onContextMenu={e => onContextMenu(e, item)}
              draggable={!!dnd}
              onDragStart={dnd ? e => dnd.onItemDragStart(e, item) : undefined}
              {...(isFolder && dnd ? {
                onDragOver:  (e: React.DragEvent) => dnd.onFolderDragOver(e, item),
                onDragLeave: (e: React.DragEvent) => dnd.onFolderDragLeave(e, item),
                onDrop:      (e: React.DragEvent) => dnd.onDropOnFolder(e, item),
              } : {})}
              className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${(isSel || isMarked) ? 'bg-primary/5' : ''} ${dropActive ? 'ring-2 ring-inset ring-primary' : ''}`}
            >
              {showCheck && (
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={isMarked}
                    onClick={e => e.stopPropagation()}
                    onChange={() => onToggleMark!(item)}
                    aria-label={`Select ${item.name}`}
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                </td>
              )}
              <td className="px-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {item.type === 'folder'
                      ? <FolderGlyph small />
                      : thumb
                        ? <img src={thumb} alt="" className="h-full w-full object-cover" />
                        : <FileGlyph category={categorize(item.mime)} small />}
                  </span>
                  <span className="truncate">{item.name}</span>
                  {selectable && isSel && <span aria-hidden className="text-primary">✓</span>}
                </span>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{item.type === 'folder' ? 'Folder' : categorize(item.mime)}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{item.type === 'folder' ? '—' : formatSize(item.size)}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{formatDate(item.updatedAt)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Context menu ─────────────────────────────────────────
function ContextMenu({ item, x, y, onClose, onRename, onMove, onDelete }: {
  item: MediaRecord
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onMove: () => void
  onDelete: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Defer so the opening contextmenu event doesn't immediately self-close.
    const t = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp within the viewport.
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 180)
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 160)
  const isFile = item.type === 'file'
  return (
    <div
      role="menu"
      className="fixed z-[60] min-w-[10rem] overflow-hidden rounded-md border bg-popover py-1 text-sm shadow-md"
      style={{ left, top }}
      onClick={e => e.stopPropagation()}
    >
      <MenuItem onClick={onRename}>Rename</MenuItem>
      <MenuItem onClick={onMove}>Move…</MenuItem>
      {isFile && item.url && (
        <a
          href={item.url}
          download={item.name}
          onClick={onClose}
          className="block px-3 py-1.5 hover:bg-muted"
          role="menuitem"
        >
          Download
        </a>
      )}
      <div className="my-1 border-t" />
      <MenuItem destructive onClick={onDelete}>Delete</MenuItem>
    </div>
  )
}

function MenuItem({ children, onClick, destructive = false }: { children: React.ReactNode; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-muted ${destructive ? 'text-destructive' : ''}`}
    >
      {children}
    </button>
  )
}

// ── Rename dialog ────────────────────────────────────────
function RenameDialog({ item, onClose, onSubmit }: { item: MediaRecord; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(item.name)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit(name) }}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg"
      >
        <h2 className="text-sm font-semibold">Rename {item.type === 'folder' ? 'folder' : 'file'}</h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-md border px-3 text-sm hover:bg-muted">Cancel</button>
          <button type="submit" disabled={!name.trim()} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Rename</button>
        </div>
      </form>
    </div>
  )
}

// ── Move dialog (folder picker) ──────────────────────────
function MoveDialog({ apiBase, items, onClose, onMove }: {
  apiBase: string
  items: MediaRecord[]
  onClose: () => void
  onMove: (destId: string | null) => void
}) {
  const [pickerFolder, setPickerFolder] = useState<string | null>(null)
  const [pickerTrail, setPickerTrail] = useState<Crumb[]>([])
  const [folders, setFolders] = useState<MediaRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Can't move an item into itself; the server also rejects descendant cycles.
  const movingIds = useMemo(() => new Set(items.map(i => i.id)), [items])
  const sourceParent = items.length === 1 ? items[0]!.parentId : undefined
  const title = items.length === 1 ? `Move “${items[0]!.name}”` : `Move ${items.length} items`

  useEffect(() => {
    let active = true
    setLoading(true)
    listMedia(apiBase, { parentId: pickerFolder, perPage: 100 })
      .then(res => { if (active) setFolders(res.data.filter(r => r.type === 'folder' && !movingIds.has(r.id))) })
      .catch(() => { if (active) setFolders([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiBase, pickerFolder, movingIds])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-3 rounded-lg border bg-background p-5 shadow-lg">
        <h2 className="text-sm font-semibold">{title}</h2>
        {/* Destination breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <CrumbButton active={pickerTrail.length === 0} onClick={() => { setPickerTrail([]); setPickerFolder(null) }}>Media</CrumbButton>
          {pickerTrail.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <CrumbButton active={i === pickerTrail.length - 1} onClick={() => { setPickerTrail(t => t.slice(0, i + 1)); setPickerFolder(c.id) }}>{c.name}</CrumbButton>
            </span>
          ))}
        </nav>
        <div className="max-h-64 min-h-[8rem] overflow-auto rounded-md border">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : folders.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No subfolders here.</p>
          ) : folders.map(f => (
            <button
              key={f.id}
              onClick={() => { setPickerTrail(t => [...t, { id: f.id, name: f.name }]); setPickerFolder(f.id) }}
              className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
            >
              <FolderGlyph small />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            Into: {pickerTrail.length === 0 ? 'Media (root)' : pickerTrail[pickerTrail.length - 1]!.name}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 rounded-md border px-3 text-sm hover:bg-muted">Cancel</button>
            <button
              onClick={() => onMove(pickerFolder)}
              disabled={pickerFolder === sourceParent || movingIds.has(pickerFolder ?? '')}
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Preview modal ────────────────────────────────────────
function PreviewModal({ record, onClose, onDelete }: {
  record: MediaRecord
  onClose: () => void
  onDelete: (r: MediaRecord) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Preview = resolveMediaPreview(record.mime)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-6" onClick={onClose}>
      <div className="mb-3 flex items-center justify-between text-white" onClick={e => e.stopPropagation()}>
        <span className="truncate text-sm font-medium">{record.name}</span>
        <div className="flex items-center gap-2 text-sm">
          {record.url && <a href={record.url} download className="rounded-md bg-white/10 px-3 py-1 hover:bg-white/20">Download</a>}
          <button onClick={() => onDelete(record)} className="rounded-md bg-white/10 px-3 py-1 hover:bg-destructive/80">Delete</button>
          <button onClick={onClose} className="rounded-md bg-white/10 px-3 py-1 hover:bg-white/20">Close</button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto" onClick={e => e.stopPropagation()}>
        {Preview
          ? <Preview url={record.url ?? ''} mime={record.mime} name={record.name} record={record} />
          : <p className="text-white/70">No preview available.</p>}
      </div>
    </div>
  )
}

// ── New folder dialog ────────────────────────────────────
function NewFolderDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-lg"
      >
        <h2 className="text-sm font-semibold">New folder</h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Folder name"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-md border px-3 text-sm hover:bg-muted">Cancel</button>
          <button type="submit" disabled={!name.trim()} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Create</button>
        </div>
      </form>
    </div>
  )
}

// ── Small presentational bits ────────────────────────────
function CrumbButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 truncate rounded px-2 py-1 transition-colors ${active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

function EmptyState({ dragging, onUpload }: { dragging: boolean; onUpload: () => void }) {
  return (
    <button
      onClick={onUpload}
      className={`flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors ${dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
    >
      <FolderGlyph />
      <span>{dragging ? 'Drop files to upload' : 'Drop files here, or click to upload'}</span>
    </button>
  )
}

function FolderGlyph({ small = false }: { small?: boolean }) {
  return (
    <svg className={`${small ? 'h-4 w-4' : 'h-9 w-9'} text-primary/70`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12a2.25 2.25 0 0 1 2.25-2.25h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function FileGlyph({ category, small = false }: { category: string; small?: boolean }) {
  if (small) {
    return (
      <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1 text-muted-foreground">
      <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="text-[10px] uppercase">{category}</span>
    </div>
  )
}

// ── Misc helpers ─────────────────────────────────────────
function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function GridIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm9.75 0A2.25 2.25 0 0 1 15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm-9.75 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Zm9.75 0a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6h.007v.008H3.75V6Zm0 6h.007v.008H3.75V12Zm0 6h.007v.008H3.75V18ZM8.25 6h12M8.25 12h12M8.25 18h12" />
    </svg>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/40" />
      ))}
    </div>
  )
}
