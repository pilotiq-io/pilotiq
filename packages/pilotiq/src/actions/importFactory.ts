/**
 * Internals for the `Action.import` factory. Lives in its own module
 * to keep the cycle between `Action.ts` and the field types (Select /
 * FileUpload) honest — `Action.import` calls in here via dynamic import
 * inside the handler.
 */

import type { ActionContext } from './Action.js'
import { parseCsv } from '../io/csv.js'
import type { Element } from '../schema/Element.js'
import { FileUpload } from '../fields/FileUploadField.js'
import { SelectField } from '../fields/SelectField.js'

export type ImportFormat = 'csv' | 'json'

export interface ImportSummary {
  created:  number
  updated:  number
  skipped:  number
  /** Per-row failure messages (non-empty `validate` returns + thrown
   *  errors during create / update). 1-indexed for human-friendly
   *  display in the success notification. */
  errors:   Array<{ row: number; message: string }>
}

export interface ImportContext extends ActionContext {
  rowIndex?: number
}

export interface ImportOptions {
  /** CSV / JSON header → model attribute key. Default: identity (the
   *  CSV header IS the model attribute). For JSON, this remaps the
   *  parsed object keys 1:1. */
  columns?: Record<string, string>
  /** Output format. Default `'csv'`. JSON-format imports parse the
   *  uploaded file as `JSON.parse(text)`; arrays import as-is, single
   *  objects wrap into `[obj]`. */
  format?: ImportFormat
  /** Model attribute used as the upsert key. When set, the importer
   *  looks up an existing record by `M.query().where(upsertBy, row[upsertBy])`
   *  before deciding create vs update. When omitted, every row is a
   *  create. */
  upsertBy?: string
  /** Per-row guard. Return a string to skip the row + accumulate as a
   *  failure; return `null` (or `undefined`) to allow the row through.
   *  Async-aware. */
  validate?: (
    row: Record<string, unknown>,
    ctx: ImportContext,
  ) => string | null | undefined | Promise<string | null | undefined>
  /** Mutate the row payload before `M.create`. Async-aware. */
  beforeCreate?: (
    row: Record<string, unknown>,
    ctx: ImportContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  /** Mutate the row payload before `M.update`. Receives the existing
   *  record so the hook can copy / preserve fields the import shouldn't
   *  overwrite. Async-aware. */
  beforeUpdate?: (
    row: Record<string, unknown>,
    existing: unknown,
    ctx: ImportContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  /** Hard cap on the row count. Aborts with an error notification when
   *  exceeded — protects against accidental million-row uploads. Default
   *  `10_000`. */
  maxRows?: number
  /** Final hook after the import loop. Useful for audit-log writes,
   *  cache invalidation, etc. Async-aware. */
  onComplete?: (summary: ImportSummary, ctx: ImportContext) => void | Promise<void>
}

/**
 * Parse an uploaded file's text into an array of row objects keyed by
 * model attribute (after applying `opts.columns` remap for CSV).
 *
 * Throws on invalid CSV / JSON; the caller's outer `try` surfaces the
 * error message via the result notification.
 */
export function parseImportText(
  text:    string,
  format:  ImportFormat,
  columns?: Record<string, string>,
): Array<Record<string, unknown>> {
  if (format === 'json') {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>
    if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>]
    throw new Error('JSON import expected an array or object')
  }
  const csv = parseCsv(text)
  if (!columns || Object.keys(columns).length === 0) {
    return csv.rows
  }
  // Remap CSV headers → model keys. CSV cells stay as strings; the ORM
  // does any final coercion (or the user's `beforeCreate` hook).
  return csv.rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [csvKey, value] of Object.entries(row)) {
      const modelKey = columns[csvKey] ?? csvKey
      out[modelKey] = value
    }
    return out
  })
}

/**
 * Run the per-row import loop. Pulled out of the factory body so the
 * factory stays at the level of "compose modal + handler" instead of
 * "do the work".
 *
 * Returns the aggregated summary (counts + per-row error messages).
 * Failures don't roll back — partial-success is the contract. The
 * caller surfaces the summary via a notification.
 */
export async function runImport(
  rows: Array<Record<string, unknown>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  M:    any,
  mode: 'create' | 'upsert',
  opts: ImportOptions,
  ctx:  ImportContext,
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] }
  const upsertBy = opts.upsertBy

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const rowCtx: ImportContext = { ...ctx, rowIndex: i }
    try {
      const guard = await opts.validate?.(row, rowCtx)
      if (typeof guard === 'string' && guard.length > 0) {
        summary.skipped++
        summary.errors.push({ row: i + 1, message: guard })
        continue
      }

      if (mode === 'upsert' && upsertBy) {
        const slice = await M.query().where(upsertBy, row[upsertBy]).paginate(1, 1)
        const existing = (slice?.data ?? [])[0]
        if (existing) {
          const id = String((existing as { id?: unknown }).id ?? '')
          const payload = opts.beforeUpdate
            ? await opts.beforeUpdate(row, existing, rowCtx)
            : row
          await M.update(id, payload)
          summary.updated++
          continue
        }
      }

      const payload = opts.beforeCreate
        ? await opts.beforeCreate(row, rowCtx)
        : row
      await M.create(payload)
      summary.created++
    } catch (err) {
      summary.skipped++
      summary.errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'unknown' })
    }
  }

  await opts.onComplete?.(summary, ctx)
  return summary
}

/** Build the modal-form schema for an import action. v1 ships:
 *
 *  - `FileUpload.make('file')` — required, capped at 10 MB, accepts
 *    `.csv,.json` by default; users can override the field via the
 *    `Action.schema([...])` chain.
 *  - When `upsertBy` is set, a `Select.make('mode')` toggles between
 *    "Create only" and "Create or update" with `'upsert'` as the
 *    default selection.
 *
 *  Returns an `Element[]` the factory drops into `Action.schema(...)`
 *  to drive the auto-built modal form. */
export function buildImportSchema(opts: ImportOptions): Element[] {
  const elements: Element[] = []

  const file = FileUpload.make('file')
    .label('File')
    .accept(['.csv', '.json', 'text/csv', 'application/json'])
    .maxSize(10_000_000)
    .required()
  elements.push(file as unknown as Element)

  if (typeof opts.upsertBy === 'string' && opts.upsertBy.length > 0) {
    const mode = SelectField.make('mode')
      .label('Mode')
      .options([
        { value: 'create', label: 'Create only' },
        { value: 'upsert', label: 'Create or update' },
      ])
      .default('upsert')
    elements.push(mode as unknown as Element)
  }

  return elements
}

/** Build a one-line success / warning notification body for the
 *  import summary — surfaces the first 5 row failures inline so users
 *  see what went wrong without hunting through logs. */
export function buildImportNotification(summary: ImportSummary, opts: { upsert: boolean }): {
  type:  'success' | 'warning' | 'error'
  title: string
  body?: string
} {
  const total = summary.created + summary.updated + summary.skipped
  if (total === 0) {
    return { type: 'warning', title: 'Import complete — no rows processed' }
  }
  const parts: string[] = [`${summary.created} created`]
  if (opts.upsert) parts.push(`${summary.updated} updated`)
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`)
  const title = `Import complete — ${parts.join(', ')}`
  const type: 'success' | 'warning' = summary.errors.length > 0 ? 'warning' : 'success'
  if (summary.errors.length === 0) return { type, title }
  const body = summary.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`).join('\n')
  return { type, title, body }
}
