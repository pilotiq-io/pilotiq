import React, { useState } from 'react'
import { CheckIcon, CircleIcon, CopyIcon } from 'lucide-react'
import type { ElementMeta } from '../../../schema/Element.js'
import {
  BADGE_COLOR_CLASSES,
  COLUMN_COLOR_CLASSES,
  COLUMN_WEIGHT_CLASSES,
} from '../constants.js'
import { resolveIcon } from '../helpers.js'
import { applyColumnFormat } from '../columnFormat.js'

// ─── Table cell rendering ───────────────────────────────────
//
// `formatCell` is the column-type dispatch (text / badge / icon /
// image / color + array variants). `wrapCell` and `wrapCellList`
// apply the shared text chrome (color / weight / tooltip / line-clamp /
// wrap / copy-to-clipboard) so every column-type path stays consistent.

/** Render a cell. Honors the column's `columnType` (badge/icon/boolean/
 * image), built-in `format` spec, and per-row `_formatted[name]`
 * overrides from server-side `formatStateUsing` callbacks. */
export function formatCell(
  value: unknown,
  col?:  ElementMeta,
  row?:  Record<string, unknown>,
): React.ReactNode {
  if (col === undefined) {
    // Legacy raw-value fallback for non-column callsites.
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
    if (value instanceof Date)               return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    if (typeof value === 'boolean')          return value ? 'Yes' : 'No'
    if (typeof value === 'object')           return JSON.stringify(value)
    return String(value)
  }

  const columnType = String(col['columnType'] ?? 'text')
  const fallback   = (col['default'] as string | undefined)

  // Per-row server-eval result wins over everything.
  const colName    = String(col['name'] ?? '')
  const formatted  = (row?.['_formatted'] as Record<string, string> | undefined)?.[colName]
  const richtext   = (row?.['_richtextCells'] as Record<string, true> | undefined)?.[colName] === true
  const isBlank    = value === null || value === undefined || value === ''

  if (formatted !== undefined && formatted !== '') {
    return wrapCell(formatted, col, richtext)
  }
  if (isBlank) {
    return <span className="text-muted-foreground">{fallback ?? '—'}</span>
  }

  switch (columnType) {
    case 'badge': {
      const map  = (col['badgeColors'] as Record<string, string> | undefined) ?? {}
      const color = map[String(value)] ?? 'gray'
      const cls  = BADGE_COLOR_CLASSES[color] ?? BADGE_COLOR_CLASSES['gray']
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {String(value)}
        </span>
      )
    }
    case 'icon':
    case 'boolean': {
      const map  = (col['iconOptions'] as Record<string, { icon: string; color?: string }> | undefined) ?? {}
      const opt  = map[String(value)]
      if (!opt) return <span className="text-muted-foreground">—</span>
      const Icon = resolveIcon(opt.icon) ?? CircleIcon
      const colorClass = opt.color ? (COLUMN_COLOR_CLASSES[opt.color] ?? '') : ''
      return <Icon className={`size-4 inline ${colorClass}`} aria-label={String(value)} />
    }
    case 'image': {
      const url = String(value)
      const size = (col['imageSize'] as number | undefined) ?? 32
      const shape = col['imageShape'] === 'circle' ? 'rounded-full' : 'rounded-md'
      return (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className={`${shape} object-cover`}
        />
      )
    }
    case 'color': {
      const css = String(value)
      const shape = col['colorShape'] as 'rounded' | 'square' | 'circle' | undefined
      const shapeClass =
        shape === 'circle' ? 'rounded-full' :
        shape === 'square' ? 'rounded-none' : 'rounded'
      const hideValue = col['colorHideValue'] === true
      return (
        <span className="inline-flex items-center gap-2">
          <span
            className={`size-4 border border-border ${shapeClass}`}
            style={{ backgroundColor: css }}
            aria-hidden="true"
          />
          {!hideValue && <span className="text-sm">{css}</span>}
        </span>
      )
    }
    default: {
      // Array-valued cells — `bulleted()` wins over `listWithLineBreaks()`
      // when both are set. Falls through to the standard string path for
      // non-array values so the per-cell formatters keep working.
      if (Array.isArray(value)) {
        const items = value.map(v => String(v))
        if (col['bulleted'] === true) {
          return wrapCellList(items, col, 'bulleted')
        }
        if (col['listWithLineBreaks'] === true) {
          return wrapCellList(items, col, 'lines')
        }
        // Bare array — comma-join (matches the existing legacy fallback).
        return wrapCell(items.join(', '), col)
      }
      // Text column — apply built-in format, then wrapper.
      const fmt = col['format'] as { kind: string; [k: string]: unknown } | undefined
      const display = fmt ? applyColumnFormat(value, fmt) : String(value)
      return wrapCell(display, col)
    }
  }
}

/** Apply text-rendering chrome (color, weight, line-clamp, wrap, tooltip)
 * to a stringified cell value. Used by the text and per-row formatter
 * paths so styling stays consistent. When `asHtml` is true the content
 * is server-rendered HTML (e.g. from the registered richtext renderer)
 * and gets injected via `dangerouslySetInnerHTML`. */
function wrapCell(content: string, col: ElementMeta, asHtml = false): React.ReactNode {
  const color    = col['color']    as string | undefined
  const weight   = col['weight']   as string | undefined
  const tooltip  = col['tooltip']  as string | undefined
  const wrapping = Boolean(col['wrap'])
  const clamp    = col['lineClamp'] as number | undefined
  const copyMsg  = col['copyMessage'] as string | undefined

  const colorCls   = color  ? (COLUMN_COLOR_CLASSES[color]  ?? '') : ''
  const weightCls  = weight ? (COLUMN_WEIGHT_CLASSES[weight] ?? '') : ''
  const wrapCls    = wrapping ? 'whitespace-normal' : ''
  const clampStyle = clamp !== undefined
    ? { display: '-webkit-box', WebkitLineClamp: String(clamp), WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
    : undefined

  const valueNode = asHtml
    ? (
        <span
          className={`prose prose-sm max-w-none dark:prose-invert ${colorCls} ${weightCls} ${wrapCls}`.trim()}
          title={tooltip}
          style={clampStyle}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    : (
        <span
          className={`${colorCls} ${weightCls} ${wrapCls}`.trim()}
          title={tooltip}
          style={clampStyle}
        >
          {content}
        </span>
      )

  if (copyMsg === undefined) return valueNode

  // Copy-to-clipboard trigger — copies the rendered text. For richtext
  // cells the underlying source isn't separately stamped on the wire
  // (would double the row payload), so the rendered HTML is what gets
  // copied; admins comfortable with HTML still get something usable.
  return (
    <span className="inline-flex items-center gap-1.5">
      {valueNode}
      <CellCopyButton text={content} label={copyMsg} />
    </span>
  )
}

/** Tabular-list rendering used by `Column.bulleted()` /
 * `Column.listWithLineBreaks()`. `mode='bulleted'` mounts a `<ul>` with
 * bullet markers; `mode='lines'` separates entries with `<br>`. Both
 * inherit the same color / weight / wrap / tooltip / clamp chrome as
 * the text path. Empty arrays fall through to the muted dash. */
function wrapCellList(
  items: string[],
  col:   ElementMeta,
  mode:  'bulleted' | 'lines',
): React.ReactNode {
  if (items.length === 0) {
    const fallback = (col['default'] as string | undefined) ?? '—'
    return <span className="text-muted-foreground">{fallback}</span>
  }
  const color    = col['color']   as string | undefined
  const weight   = col['weight']  as string | undefined
  const tooltip  = col['tooltip'] as string | undefined

  const colorCls   = color  ? (COLUMN_COLOR_CLASSES[color]  ?? '') : ''
  const weightCls  = weight ? (COLUMN_WEIGHT_CLASSES[weight] ?? '') : ''

  if (mode === 'bulleted') {
    return (
      <ul
        className={`list-disc pl-4 space-y-0.5 ${colorCls} ${weightCls}`.trim()}
        title={tooltip}
      >
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    )
  }
  return (
    <span
      className={`${colorCls} ${weightCls}`.trim()}
      title={tooltip}
    >
      {items.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {s}
        </React.Fragment>
      ))}
    </span>
  )
}

/** Slim copy-to-clipboard button used by `Column.copyMessage()`. The
 * label doubles as the toast text. Mirrors `EntryCopyButton`'s shape
 * but compact enough to live inline next to a cell value. */
function CellCopyButton({ text, label }: { text: string; label: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }).catch(() => { /* ignore — older browser / permission denied */ })
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? label : 'Copy'}
      title={copied ? label : 'Copy'}
      data-no-row-nav
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  )
}

/** Resolve a stable row identifier — prefers the row's `id` field, falls
 *  back to the row index for rows missing one. Used as the React key
 *  in table bodies and as the `:id` substitution for row actions. */
export function rowId(row: unknown, index: number): string {
  if (row && typeof row === 'object' && 'id' in row) {
    const id = (row as { id?: unknown }).id
    if (id !== undefined && id !== null) return String(id)
  }
  return String(index)
}
