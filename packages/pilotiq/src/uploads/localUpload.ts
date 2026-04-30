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
 * URL `<urlPrefix>/<directory>/<random-id>.<ext>`.
 *
 * v1: synchronous-ish (single `writeFile` per upload). No chunking,
 * no resumable uploads, no image processing.
 */
export function localUpload(config: LocalUploadConfig): UploadAdapter {
  return {
    async put(req: UploadRequest): Promise<UploadResult> {
      const { file, directory } = req
      const ext     = sanitizeExt(extname(file.name))
      const id      = randomId()
      const subDir  = sanitizeDir(directory)
      const fullDir = subDir
        ? join(config.root, subDir)
        : config.root

      await mkdir(fullDir, { recursive: true })

      const filename = `${id}${ext}`
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

function sanitizeExt(ext: string): string {
  // Extension comes from a user-uploaded filename — keep it conservative.
  if (!ext || ext.length > 10) return ''
  if (!/^\.[A-Za-z0-9]+$/.test(ext)) return ''
  return ext.toLowerCase()
}

function randomId(): string {
  return randomBytes(16).toString('hex')
}
