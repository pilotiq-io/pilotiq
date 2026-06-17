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
} from './mediaClient.js'

// Safety net — ensures the built-in previews exist even if the host's
// client entry forgot to call it (idempotent).
registerBuiltinMediaPreviews()

interface Crumb { id: string; name: string }
interface ActiveUpload { id: string; name: string; progress: number; error?: string }

export interface MediaLibraryProps {
  /** Present when mounted as a `View` widget on the library page. Unused. */
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
}

export function MediaLibrary({
  mode = 'manage',
  multiple = false,
  onSelect,
  apiBase: apiBaseProp,
}: MediaLibraryProps = {}): React.JSX.Element {
  const apiBase = useMemo(() => apiBaseProp ?? deriveApiBase('media'), [apiBaseProp])
  const selecting = mode === 'select'

  const [folderId, setFolderId] = useState<string | null>(null)
  const [trail, setTrail] = useState<Crumb[]>([])
  const [items, setItems] = useState<MediaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uploads, setUploads] = useState<ActiveUpload[]>([])
  const [preview, setPreview] = useState<MediaRecord | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Select-mode multi-select buffer, keyed by id (preserves clicked records
  // so the footer "Add" can return them even after navigating folders away).
  const [selected, setSelected] = useState<Record<string, MediaRecord>>({})
  const fileInput = useRef<HTMLInputElement>(null)

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
          onProgress: p => setUploads(list => list.map(x => x.id === u.id ? { ...x, progress: p } : x)),
        })
      } catch (err) {
        setUploads(list => list.map(x => x.id === u.id ? { ...x, error: err instanceof Error ? err.message : 'Failed' } : x))
      }
    }))
    // Clear finished uploads after a beat, then refresh.
    setTimeout(() => setUploads(list => list.filter(x => x.error)), 1200)
    await load(folderId, search)
  }, [apiBase, folderId, search, load])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void runUploads(files)
  }, [runUploads])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) void runUploads(files)
  }, [runUploads])

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

  const onActivate = useCallback((rec: MediaRecord) => {
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
  }, [openFolder, selecting, multiple, onSelect])

  const selectedList = useMemo(() => Object.values(selected), [selected])
  const confirmSelection = useCallback(() => {
    if (selectedList.length > 0) onSelect?.(selectedList)
  }, [selectedList, onSelect])

  return (
    <div
      className={`flex min-h-[28rem] flex-col rounded-lg border ${dragging ? 'ring-2 ring-primary' : ''}`}
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

      {/* Body */}
      <div className="flex-1 p-4">
        {error && <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        {loading ? (
          <GridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState dragging={dragging} onUpload={() => fileInput.current?.click()} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
            {items.map(item => (
              <Tile
                key={item.id}
                item={item}
                onActivate={onActivate}
                onDelete={onDelete}
                selectable={selecting}
                selected={!!selected[item.id]}
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
    </div>
  )
}

// ── Tile ─────────────────────────────────────────────────
function thumbFor(rec: MediaRecord): string | null {
  if (rec.type !== 'file' || !(rec.mime ?? '').startsWith('image/')) return null
  const thumb = rec.conversions.find(c => c.name === 'thumb' && c.url)
  return thumb?.url ?? rec.url ?? null
}

function Tile({ item, onActivate, onDelete, selectable = false, selected = false }: {
  item: MediaRecord
  onActivate: (r: MediaRecord) => void
  onDelete: (r: MediaRecord) => void
  selectable?: boolean
  selected?: boolean
}) {
  const thumb = thumbFor(item)
  const isFile = item.type === 'file'
  return (
    <div className="group relative">
      <button
        onDoubleClick={() => onActivate(item)}
        onClick={() => onActivate(item)}
        aria-pressed={selectable && isFile ? selected : undefined}
        className={[
          'flex w-full flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:border-primary/50 hover:bg-muted/50',
          selected ? 'border-primary ring-2 ring-primary' : '',
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
      {/* Selected check badge (select mode). */}
      {selected && (
        <span
          aria-hidden
          className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm"
        >
          ✓
        </span>
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

function FolderGlyph() {
  return (
    <svg className="h-9 w-9 text-primary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12a2.25 2.25 0 0 1 2.25-2.25h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function FileGlyph({ category }: { category: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-muted-foreground">
      <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="text-[10px] uppercase">{category}</span>
    </div>
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
