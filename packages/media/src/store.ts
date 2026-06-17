/**
 * Node-only orchestration for the `_media` library — the storage / image /
 * model layer behind the route handlers. Composes the pure helpers in
 * `pipeline.ts` with `@rudderjs/storage` (disk writes), `@rudderjs/image`
 * (metadata + conversions), and the `Media` model (persistence).
 *
 * This module statically imports Node-only packages, so it must NEVER be
 * imported from the client-safe graph (`index.ts` / `plugin.ts`). `routes.ts`
 * loads it lazily inside its request handlers, which only ever run server-side.
 */
import { Storage } from '@rudderjs/storage'
import { image } from '@rudderjs/image'
import { Media } from './Media.js'
import type { ConversionInfo, MediaRecord } from './types.js'
import type { MediaLibrary } from './registry.js'
import {
  toRecord,
  isAccessible,
  isImageMime,
  mapConversions,
  buildStorageKey,
  makeUploadToken,
  safeFilename,
  type MediaAttrs,
  type MediaAuth,
  type ListQuery,
} from './pipeline.js'

/** Thrown for structurally-invalid requests (move cycles, non-folder targets).
 *  The route layer maps these to `422`; a plain `null` return means not-found
 *  (or no access) → `404`. */
export class MediaRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaRequestError'
  }
}

/** Paginated `listMedia` envelope. */
export interface MediaListResult {
  data:     MediaRecord[]
  total:    number
  page:     number
  perPage:  number
  lastPage: number
}

/** Read the column bag off a `Media` instance (decoupling the pure `toRecord`
 *  mapper from the live model). */
function attrsOf(m: Media): MediaAttrs {
  return {
    id:          m.id,
    name:        m.name,
    type:        m.type,
    mime:        m.mime,
    size:        m.size,
    disk:        m.disk,
    directory:   m.directory,
    filename:    m.filename,
    width:       m.width,
    height:      m.height,
    focalX:      m.focalX,
    focalY:      m.focalY,
    conversions: m.conversions,
    alt:         m.alt,
    meta:        m.meta,
    parentId:    m.parentId,
    scope:       m.scope,
    userId:      m.userId,
    createdAt:   m.createdAt,
    updatedAt:   m.updatedAt,
  }
}

/** Attach the public `url` to a file record (resolved through its disk).
 *  Folders + url-less records pass through untouched. */
function withUrl(rec: MediaRecord): MediaRecord {
  if (rec.type !== 'file' || !rec.filename) return rec
  try {
    rec.url = Storage.disk(rec.disk).url(buildStorageKey(rec.directory, rec.filename))
  } catch {
    /* remote disk without a public URL — leave `url` unset */
  }
  return rec
}

/** Map an instance straight to a url-stamped wire record. */
function record(m: Media): MediaRecord {
  return withUrl(toRecord(attrsOf(m)))
}

/** Load an instance only if the request's auth scope may touch it (the IDOR
 *  guard for every single-record op). */
async function loadAccessible(id: string, auth: MediaAuth): Promise<Media | null> {
  const m = await Media.find(id)
  if (!m) return null
  return isAccessible(toRecord(attrsOf(m)), auth) ? m : null
}

/** Escape LIKE metacharacters in a user search term (SQLite/MySQL `\` escape). */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * List one folder's direct children, scoped to the request's visibility and
 * paginated. Folders sort before files; within each, by the requested column.
 */
export async function listMedia(opts: ListQuery, auth: MediaAuth): Promise<MediaListResult> {
  // A private listing with no authenticated user can't match anything.
  if (opts.scope === 'private' && auth.userId === null) {
    return { data: [], total: 0, page: opts.page, perPage: opts.perPage, lastPage: 1 }
  }

  let q = Media.query()
  if (opts.scope === 'private') {
    q = q.where('scope', 'private').where('userId', auth.userId)
  } else {
    q = q.where('scope', 'shared')
  }
  q = opts.parentId === null ? q.whereNull('parentId') : q.where('parentId', opts.parentId)
  if (opts.search) q = q.where('name', 'LIKE', `%${escapeLike(opts.search)}%`)

  // `type` DESC puts 'folder' before 'file'; then the requested sort.
  q = q.orderBy('type', 'DESC').orderBy(opts.sort, opts.dir)

  const result = await q.paginate(opts.page, opts.perPage)
  return {
    data:     result.data.map(record),
    total:    result.total,
    page:     result.currentPage,
    perPage:  result.perPage,
    lastPage: result.lastPage,
  }
}

/** Fetch one record by id (or `null` when missing / out of the auth scope). */
export async function getMedia(id: string, auth: MediaAuth): Promise<MediaRecord | null> {
  const m = await loadAccessible(id, auth)
  return m ? record(m) : null
}

/** Create a folder under `parentId` (null = library root). */
export async function createFolder(
  input: { name: string; parentId: string | null },
  auth:  MediaAuth,
): Promise<MediaRecord> {
  const m = await Media.create({
    name:        input.name,
    type:        'folder',
    mime:        null,
    size:        null,
    disk:        'public',
    directory:   '',
    filename:    null,
    width:       null,
    height:      null,
    focalX:      null,
    focalY:      null,
    conversions: [],
    alt:         null,
    meta:        {},
    parentId:    input.parentId,
    scope:       auth.scope,
    userId:      auth.scope === 'private' ? auth.userId : null,
  })
  return record(m)
}

/**
 * Persist an uploaded file: write the original to the library disk inside a
 * unique per-upload directory, generate the library's image conversions (for
 * images), probe dimensions, then create the `Media` row.
 */
export async function uploadFile(
  input:   { file: File; parentId: string | null; alt: string | null },
  library: MediaLibrary,
  auth:    MediaAuth,
): Promise<MediaRecord> {
  const { file, parentId, alt } = input

  // Each upload lives in its own directory so the original AND the
  // spec-named conversions can't collide with another upload's.
  const directory = buildStorageKey(library.directory, makeUploadToken(file.name))
  const filename  = safeFilename(file.name)
  const key       = buildStorageKey(directory, filename)
  const buffer    = Buffer.from(await file.arrayBuffer())

  await Storage.disk(library.disk).put(key, buffer)

  let width:  number | null = null
  let height: number | null = null
  let conversions: ConversionInfo[] = []

  if (isImageMime(file.type)) {
    try {
      const meta = await image(buffer).metadata()
      width  = typeof meta.width  === 'number' ? meta.width  : null
      height = typeof meta.height === 'number' ? meta.height : null
    } catch {
      /* metadata probe failed (corrupt / unsupported) — store without dims */
    }
    if (library.conversions && library.conversions.length > 0) {
      const results = await image(buffer)
        .conversions(library.conversions)
        .generateToStorage(library.disk, directory)
      conversions = mapConversions(results)
    }
  }

  const m = await Media.create({
    name:        file.name,
    type:        'file',
    mime:        file.type || null,
    size:        file.size,
    disk:        library.disk,
    directory,
    filename,
    width,
    height,
    focalX:      null,
    focalY:      null,
    conversions,
    alt,
    meta:        {},
    parentId,
    scope:       auth.scope,
    userId:      auth.scope === 'private' ? auth.userId : null,
  })
  return record(m)
}

/** Rename a file or folder. Returns `null` when missing / inaccessible. */
export async function renameMedia(
  id:   string,
  name: string,
  auth: MediaAuth,
): Promise<MediaRecord | null> {
  const m = await loadAccessible(id, auth)
  if (!m) return null
  await Media.update(id, { name })
  const fresh = await Media.find(id)
  return fresh ? record(fresh) : null
}

/**
 * Reparent a record under `parentId` (null = root). Throws
 * {@link MediaRequestError} for invalid moves (into itself, into a descendant,
 * or under a non-folder); returns `null` when the record / target is missing
 * or out of scope.
 */
export async function moveMedia(
  id:       string,
  parentId: string | null,
  auth:     MediaAuth,
): Promise<MediaRecord | null> {
  const m = await loadAccessible(id, auth)
  if (!m) return null

  if (parentId !== null) {
    if (parentId === id) throw new MediaRequestError('Cannot move an item into itself')
    const target = await loadAccessible(parentId, auth)
    if (!target) return null
    if (toRecord(attrsOf(target)).type !== 'folder') {
      throw new MediaRequestError('Move target is not a folder')
    }
    if (await isDescendant(parentId, id)) {
      throw new MediaRequestError('Cannot move a folder into its own descendant')
    }
  }

  await Media.update(id, { parentId })
  const fresh = await Media.find(id)
  return fresh ? record(fresh) : null
}

/** Walk up from `nodeId` via `parentId`; true if `ancestorId` is on the path
 *  (i.e. moving `ancestorId` under `nodeId` would form a cycle). Bounded by a
 *  depth cap so a pre-existing corrupt cycle can't loop forever. */
async function isDescendant(nodeId: string, ancestorId: string): Promise<boolean> {
  let current: string | null = nodeId
  for (let depth = 0; current !== null && depth < 1000; depth++) {
    if (current === ancestorId) return true
    const node = await Media.find(current)
    const parent: unknown = node ? attrsOf(node).parentId : null
    current = typeof parent === 'string' && parent.length > 0 ? parent : null
  }
  return false
}

/**
 * Delete a record. Folders delete recursively (every descendant row + every
 * stored file + conversion on disk). Returns `false` when missing / out of
 * scope.
 */
export async function deleteMedia(id: string, auth: MediaAuth): Promise<boolean> {
  const m = await loadAccessible(id, auth)
  if (!m) return false
  await deleteNode(m)
  return true
}

/** Recursively delete a node: children first (folders), then disk files
 *  (files), then the row. */
async function deleteNode(m: Media): Promise<void> {
  const rec = toRecord(attrsOf(m))
  if (rec.type === 'folder') {
    const children = await Media.query().where('parentId', rec.id).get()
    for (const child of children) await deleteNode(child)
  } else {
    await removeStoredFiles(rec)
  }
  await Media.delete(rec.id)
}

/** Best-effort removal of a file record's original + every conversion from its
 *  disk. Failures are swallowed so a missing object never blocks the row
 *  delete (the DB is the source of truth). */
async function removeStoredFiles(rec: MediaRecord): Promise<void> {
  if (!rec.filename) return
  const disk = Storage.disk(rec.disk)
  const keys = [buildStorageKey(rec.directory, rec.filename), ...rec.conversions.map(c => c.filename)]
  for (const key of keys) {
    try {
      await disk.delete(key)
    } catch {
      /* already gone / remote hiccup — DB delete still proceeds */
    }
  }
}
