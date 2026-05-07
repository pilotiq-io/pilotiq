import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import type { ColumnMeta } from '../../Column.js'
import { useWidgetData } from '../WidgetDataContext.js'

/**
 * Plan #15 Phase D — `TableWidgetRenderer`.
 *
 * Reads `_widgetData[id]` from the surrounding `WidgetDataProvider`
 * (lazy widgets fetch on mount via `widgetUrl`), then paints a slim
 * HTML table — column headers + body rows. No filters, no bulk actions,
 * no pagination, no search. The optional `viewAllUrl` renders as a
 * "View all →" link in the widget header.
 *
 * Cell formatting mirrors the full `TableRenderer` paint: per-row
 * `_formatted[colName]` (server-side `formatStateUsing`) wins over
 * built-in `format` specs (`dateTime / since / money / numeric / limit`).
 * Column types beyond plain text (`badge / icon / image`) defer to a
 * compact local switch — slim widgets typically use plain text columns,
 * but the dispatch is here for parity.
 */

interface TableWidgetPayload {
  rows:  Record<string, unknown>[]
  total?: number
}

export interface TableWidgetRendererProps {
  meta: ElementMeta
}

export function TableWidgetRenderer({ meta }: TableWidgetRendererProps) {
  const label      = typeof meta['label']      === 'string' ? (meta['label']      as string) : undefined
  const viewAllUrl = typeof meta['viewAllUrl'] === 'string' ? (meta['viewAllUrl'] as string) : undefined
  const columns    = readColumns(meta['columns'])

  const { data, error, isLoading } = useWidgetData(meta as Parameters<typeof useWidgetData>[0])

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {(label || viewAllUrl) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {label
            ? <h3 className="text-sm font-medium text-foreground">{label}</h3>
            : <span />}
          {viewAllUrl && (
            <a
              href={viewAllUrl}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all →
            </a>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        {isLoading
          ? <TableSkeleton columns={columns} />
          : error
          ? <TableError message={error} />
          : <TableBody columns={columns} rows={readRows(data)} />}
      </div>
    </div>
  )
}

function readColumns(raw: unknown): ColumnMeta[] {
  return Array.isArray(raw) ? (raw as ColumnMeta[]) : []
}

function readRows(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return []
  const rows = (data as TableWidgetPayload).rows
  return Array.isArray(rows) ? rows : []
}

interface TableBodyProps {
  columns: ColumnMeta[]
  rows:    Record<string, unknown>[]
}

function TableBody({ columns, rows }: TableBodyProps) {
  if (columns.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No columns configured.</p>
  }
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">No records to display.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-muted/30">
        <tr>
          {columns.map(col => (
            <th
              key={col.name}
              className={`px-4 py-2 text-left font-medium text-muted-foreground ${alignClass(col.alignment)}`}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-border last:border-0">
            {columns.map(col => (
              <td
                key={col.name}
                className={`px-4 py-2 ${alignClass(col.alignment)}`}
              >
                {renderCell(row[col.name], col, row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function alignClass(a?: string): string {
  if (a === 'center') return 'text-center'
  if (a === 'end')    return 'text-right'
  return 'text-left'
}

/** Slim cell renderer — handles per-row `_formatted` overrides + the
 *  built-in `format` spec. Falls back to a plain stringification for
 *  unhandled `columnType`s; richer painting (badges, icons, images)
 *  belongs to the full `TableRenderer` for the Resource list page. */
function renderCell(value: unknown, col: ColumnMeta, row: Record<string, unknown>): React.ReactNode {
  const fallback = col.default ?? '—'
  const formatted = (row['_formatted'] as Record<string, string> | undefined)?.[col.name]
  if (formatted !== undefined && formatted !== '') return formatted

  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">{fallback}</span>
  }

  const fmt = col.format
  if (fmt) return applyFormat(value, fmt)

  if (value instanceof Date) {
    return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object')  return JSON.stringify(value)
  return String(value)
}

function applyFormat(value: unknown, fmt: NonNullable<ColumnMeta['format']>): string {
  switch (fmt.kind) {
    case 'dateTime': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(d.getTime())) return String(value)
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
    case 'since': {
      const d = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(d.getTime())) return String(value)
      const seconds = Math.round((Date.now() - d.getTime()) / 1000)
      if (seconds < 60)        return `${seconds}s ago`
      if (seconds < 3600)      return `${Math.floor(seconds / 60)}m ago`
      if (seconds < 86_400)    return `${Math.floor(seconds / 3600)}h ago`
      return `${Math.floor(seconds / 86_400)}d ago`
    }
    case 'money': {
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      return new Intl.NumberFormat(fmt.locale, { style: 'currency', currency: fmt.currency }).format(n)
    }
    case 'numeric': {
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      const decimals = fmt.decimals ?? 0
      return new Intl.NumberFormat(fmt.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(n)
    }
    case 'limit': {
      const s = String(value)
      return s.length > fmt.chars ? `${s.slice(0, fmt.chars)}…` : s
    }
    case 'words': {
      const s = String(value).trim()
      if (s.length === 0) return s
      const tokens = s.split(/\s+/)
      return tokens.length > fmt.words ? `${tokens.slice(0, fmt.words).join(' ')}…` : s
    }
  }
}

// ─── Skeleton + error ─────────────────────────────────────

function TableSkeleton({ columns }: { columns: ColumnMeta[] }) {
  const cols = Math.max(1, columns.length || 3)
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-muted/30">
        <tr>
          {Array.from({ length: cols }, (_, i) => (
            <th key={i} className="px-4 py-2">
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 3 }, (_, r) => (
          <tr key={r} className="border-b border-border last:border-0">
            {Array.from({ length: cols }, (_, c) => (
              <td key={c} className="px-4 py-3">
                <div className="h-3 w-full max-w-[10rem] rounded bg-muted animate-pulse" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TableError({ message }: { message: string }) {
  return (
    <div className="border-t border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
      Failed to load table: {message}
    </div>
  )
}
