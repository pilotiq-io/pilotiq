import { mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { randomBytes } from 'node:crypto'

import type { UploadAdapter, UploadRequest, UploadResult } from './UploadAdapter.js'

export interface LocalUploadConfig {
  /**
   * Filesystem directory where files are written. Resolved relative to
   * `process.cwd()` if not absolute. The app's static-file middleware
   * must serve this directory at `urlPrefix`.
   *
   * Example: `{ root: 'public/uploads', urlPrefix: '/uploads' }` writes
   * to `<cwd>/public/uploads/<dir>/<id>.<ext>` and returns
   * `/uploads/<dir>/<id>.<ext>`.
   */
  root:      string
  /** URL prefix the file is served from. Without trailing slash. */
  urlPrefix: string
}

/**
 * Disk-backed upload adapter. Writes incoming files under
 * `config.root/<directory>/<random-id>.<ext>` and returns the public
 * URL `<urlPrefix>/<directory>/<random-id>.<ext>`. When the request
 * carries `preserveFilenames`, the sanitized original name is used in
 * place of the random id.
 *
 * v1: synchronous-ish (single `writeFile` per upload). No chunking,
 * no resumable uploads, no image processing.
 */
export function localUpload(config: LocalUploadConfig): UploadAdapter {
  return {
    async put(req: UploadRequest): Promise<UploadResult> {
      const { file, directory, preserveFilenames } = req
      const ext     = sanitizeExt(extname(file.name))
      const subDir  = sanitizeDir(directory)
      const fullDir = subDir
        ? join(config.root, subDir)
        : config.root

      await mkdir(fullDir, { recursive: true })

      // preserveFilenames: keep the (sanitized) original name. Falls back
      // to a random id when sanitizing leaves nothing usable (e.g. a name
      // made entirely of unsafe characters) so we never write a bare
      // extension. Same-name uploads overwrite — see the field docstring.
      const base = preserveFilenames ? sanitizeBaseName(file.name) : ''
      const filename = base ? `${base}${ext}` : `${randomId()}${ext}`
      const fullPath = join(fullDir, filename)
      const buffer   = Buffer.from(await file.arrayBuffer())
      await writeFile(fullPath, buffer)

      const urlParts = [config.urlPrefix.replace(/\/$/, '')]
      if (subDir) urlParts.push(subDir)
      urlParts.push(filename)
      return {
        url: urlParts.join('/'),
        meta: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      }
    },
  }
}

function sanitizeDir(d: string | undefined): string {
  if (!d) return ''
  // Strip leading/trailing slashes and any ../ segments to avoid path
  // traversal. Adapters are responsible for their own input validation.
  return d
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .filter(s => s !== '' && s !== '..' && s !== '.')
    .join('/')
}

function sanitizeBaseName(name: string): string {
  // Drop any directory segments (path-traversal defense), strip the
  // extension (re-added by the caller from the sanitized ext), and
  // reduce to a filesystem- and URL-safe slug. Returns '' when nothing
  // usable survives so the caller can fall back to a random id.
  const stem = name
    .split(/[/\\]/).pop()!          // last path segment only
    .replace(/\.[^.]+$/, '')        // strip extension
  return stem
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')  // collapse unsafe runs to a single dash
    .replace(/^[.-]+/, '')              // no leading dot (hidden file) or dash
    .replace(/[.-]+$/, '')              // no trailing dot/dash
    .slice(0, 128)
}

function sanitizeExt(ext: string): string {
  // Extension comes from a user-uploaded filename — keep it conservative.
  if (!ext || ext.length > 10) return ''
  if (!/^\.[A-Za-z0-9]+$/.test(ext)) return ''
  return ext.toLowerCase()
}

function randomId(): string {
  return randomBytes(16).toString('hex')
}
