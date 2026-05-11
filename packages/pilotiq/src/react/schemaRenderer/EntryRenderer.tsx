import React, { useState } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { CheckIcon, CircleIcon, CopyIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.js'
import { getEntryComponent } from '../../entries/registry.js'
import {
  BADGE_COLOR_CLASSES,
  COLUMN_COLOR_CLASSES,
  TEXT_COLOR_CLASSES,
  TEXT_SIZE_CLASSES,
  TEXT_WEIGHT_CLASSES,
} from './constants.js'
import { resolveIcon } from './helpers.js'
import { applyColumnFormat } from './columnFormat.js'

// ─── Entry rendering (Plan #16 — read-only label/value pairs) ───

/** Coerce a `KeyValueEntry` state value (object | JSON string | …) into a
 *  flat record. Returns `null` when the value is empty or non-decodable. */
function normalizeKeyValueValue(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Non-JSON string — fall through to null so the renderer shows the
      // fallback rather than misrepresenting it as a one-row map.
    }
    return null
  }
  if (Array.isArray(value)) return null
  if (typeof value === 'object') return value as Record<string, unknown>
  return null
}

/** Render a single kv cell value — primitives become their string form;
 *  nested objects/arrays JSON-stringify for compactness. */
function formatKeyValueCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Plan #16 — read-only label-value pair for `Resource.detail()` schemas.
 * Dispatches on `meta.entryType` (`'text' | 'badge' | 'icon' | 'image' | 'keyValue' | 'color'`).
 * Wraps the rendered value in `<EntryShell>` for the shared chrome
 * (label / helperText / tooltip / copyable trigger).
 *
 * `renderElement` is injected so the `repeatable` branch can recurse into
 * row children without re-importing the main switch.
 */
export function renderEntry(
  el: ElementMeta,
  index: number,
  renderElement: (el: ElementMeta, index: number) => React.ReactNode,
): React.ReactNode {
  const entryType = String(el['entryType'] ?? 'text')
  const value     = el['value']
  const fallback  = el['default'] ? String(el['default']) : '—'

  let body: React.ReactNode
  switch (entryType) {
    case 'text': {
      const formatted = el['_formatted'] !== undefined
        ? String(el['_formatted'])
        : (el['format']
            ? applyColumnFormat(value, el['format'] as { kind: string; [k: string]: unknown })
            : (value === null || value === undefined || value === '' ? '' : String(value)))

      const display = formatted === '' ? fallback : formatted
      const isFallback = formatted === ''
      const isRichText = el['richtext'] === true && !isFallback
      const sizeKey   = el['size']   ? String(el['size'])   : 'sm'
      const colorKey  = el['color']  ? String(el['color'])  : (isFallback ? 'muted' : 'default')
      const weightKey = el['weight'] ? String(el['weight']) : 'normal'
      const sizeCls   = TEXT_SIZE_CLASSES[sizeKey]     ?? 'text-sm'
      const colorCls  = TEXT_COLOR_CLASSES[colorKey]   ?? ''
      const weightCls = TEXT_WEIGHT_CLASSES[weightKey] ?? ''
      const lineClamp = el['lineClamp'] as number | undefined
      const wrap      = el['wrap'] === true

      const style: React.CSSProperties = {}
      if (lineClamp !== undefined) {
        style.display = '-webkit-box'
        style.WebkitLineClamp = lineClamp
        ;(style as { WebkitBoxOrient?: string }).WebkitBoxOrient = 'vertical'
        style.overflow = 'hidden'
      }
      const wrapCls = wrap ? 'whitespace-pre-wrap' : (lineClamp !== undefined ? '' : 'whitespace-nowrap')

      if (isRichText) {
        // Server-rendered HTML from a registered richtext renderer (e.g.
        // `@pilotiq/tiptap`). Wrap in `prose` for sensible default
        // styling — matches the read-only `Markdown` / `Html` primes.
        const proseSize = sizeKey === 'lg' || sizeKey === 'xl'
          ? 'prose-lg'
          : sizeKey === 'sm' || sizeKey === 'xs'
            ? 'prose-sm'
            : ''
        body = (
          <div
            className={`prose max-w-none dark:prose-invert ${proseSize} ${colorCls} ${weightCls}`.trim()}
            style={style}
            dangerouslySetInnerHTML={{ __html: display }}
          />
        )
        break
      }

      body = (
        <span className={`${sizeCls} ${colorCls} ${weightCls} ${wrapCls}`.trim()} style={style}>
          {display}
        </span>
      )
      break
    }

    case 'badge': {
      const isBlank = value === null || value === undefined || value === ''
      if (isBlank) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const map = (el['colors'] as Record<string, string> | undefined) ?? {}
      const colorKey = map[String(value)] ?? 'gray'
      const cls = BADGE_COLOR_CLASSES[colorKey] ?? BADGE_COLOR_CLASSES['gray']
      body = (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {String(value)}
        </span>
      )
      break
    }

    case 'icon': {
      const isBlank = value === null || value === undefined || value === ''
      const map = (el['options'] as Record<string, { icon: string; color?: string; label?: string }> | undefined) ?? {}
      const opt = isBlank ? undefined : map[String(value)]
      if (!opt) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const Icon = resolveIcon(opt.icon) ?? CircleIcon
      const colorClass = opt.color ? (COLUMN_COLOR_CLASSES[opt.color] ?? '') : ''
      const ariaLabel  = opt.label ?? String(value)
      body = <Icon className={`inline size-5 ${colorClass}`.trim()} aria-label={ariaLabel} />
      break
    }

    case 'image': {
      const isBlank = value === null || value === undefined || value === ''
      if (isBlank) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const url    = String(value)
      const width  = (el['imageWidth']  as number | undefined) ?? (el['imageSize'] as number | undefined) ?? 64
      const height = (el['imageHeight'] as number | undefined) ?? (el['imageSize'] as number | undefined) ?? 64
      const shape  = String(el['imageShape'] ?? 'rounded')
      const shapeCls = shape === 'circle' ? 'rounded-full' : shape === 'square' ? '' : 'rounded-md'
      body = (
        <img
          src={url}
          alt=""
          width={width}
          height={height}
          className={`inline-block object-cover ${shapeCls}`.trim()}
        />
      )
      break
    }

    case 'keyValue': {
      const parsed = normalizeKeyValueValue(value)
      const keys   = parsed ? Object.keys(parsed) : []
      if (!parsed || keys.length === 0) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const keyLabel   = el['keyLabel']   ? String(el['keyLabel'])   : 'Key'
      const valueLabel = el['valueLabel'] ? String(el['valueLabel']) : 'Value'
      body = (
        <table className="w-full border border-border text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="border-b border-border px-2 py-1">{keyLabel}</th>
              <th className="border-b border-border px-2 py-1">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k} className="border-t border-border first:border-t-0">
                <td className="px-2 py-1 align-top font-mono text-xs">{k}</td>
                <td className="px-2 py-1 align-top font-mono text-xs break-all">
                  {formatKeyValueCell(parsed[k])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
      break
    }

    case 'color': {
      const isBlank = value === null || value === undefined || value === ''
      if (isBlank) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const hex    = String(value)
      const width  = (el['colorWidth']  as number | undefined) ?? (el['colorSize'] as number | undefined) ?? 24
      const height = (el['colorHeight'] as number | undefined) ?? (el['colorSize'] as number | undefined) ?? 24
      const shape  = String(el['colorShape'] ?? 'rounded')
      const shapeCls = shape === 'circle' ? 'rounded-full' : shape === 'square' ? '' : 'rounded-md'
      const showValue = el['showValue'] !== false
      body = (
        <span className="inline-flex items-center gap-2">
          <span
            className={`inline-block border border-border ${shapeCls}`.trim()}
            style={{ width, height, backgroundColor: hex }}
            aria-label={hex}
          />
          {showValue && (
            <span className="font-mono text-xs text-muted-foreground">{hex}</span>
          )}
        </span>
      )
      break
    }

    case 'code': {
      const isBlank = value === null || value === undefined || value === ''
      if (isBlank) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }
      const text = typeof value === 'string' ? value : String(value)
      const lang = el['language'] ? String(el['language']) : undefined
      body = (
        <pre
          className="rounded-md border border-border bg-muted/40 p-3 text-xs overflow-x-auto"
          data-language={lang}
        >
          <code className="font-mono">{text}</code>
        </pre>
      )
      break
    }

    case 'component': {
      const componentName = String(el['component'] ?? '')
      if (!componentName) {
        body = (
          <EntryComponentError>
            ComponentEntry is missing its <code className="font-mono">component</code> name —
            set <code className="font-mono">static componentName = '...'</code> on the
            subclass or call <code className="font-mono">.component('...')</code> in the
            fluent form.
          </EntryComponentError>
        )
        break
      }
      const Component = getEntryComponent(componentName)
      if (!Component) {
        body = (
          <EntryComponentError>
            No component registered under name <code className="font-mono">{componentName}</code>.
            Register it at app boot:
            <pre className="mt-2 overflow-x-auto rounded bg-amber-100/60 p-2 text-xs dark:bg-amber-900/30">{`import { registerEntryComponents } from '@pilotiq/pilotiq/entries'\nregisterEntryComponents({ ${componentName}: ${componentName} })`}</pre>
          </EntryComponentError>
        )
        break
      }
      // Render-time errors propagate to React's nearest error boundary —
      // surfacing them inline here would require wrapping every entry in
      // its own boundary, which v1 doesn't ship. The two pre-render
      // sentinels above (missing name / missing registration) cover the
      // typical wiring mistakes.
      body = <Component value={value} />
      break
    }

    case 'repeatable': {
      // Read-only sibling of `Repeater`. Reads `meta.rows` (resolved by
      // `resolveRepeatableRows`) and dispatches on the chosen layout —
      // `table > grid > stack`. Empty / non-array state falls through to
      // the inherited `default()` placeholder, same as every other entry.
      const rows = (el['rows'] as Array<{ id: string; children: ElementMeta[] }> | undefined) ?? []
      if (rows.length === 0) {
        body = <span className="text-sm text-muted-foreground">{fallback}</span>
        break
      }

      const tableCfg  = el['table']     as { columns: Array<{ label: string; alignment?: 'left' | 'center' | 'right'; width?: string }> } | undefined
      const gridN     = el['grid']      as number | undefined
      const innerCols = el['columns']   as number | undefined
      const contained = el['contained'] !== false

      if (tableCfg && tableCfg.columns.length > 0) {
        const cols = tableCfg.columns
        body = (
          <table className="w-full border border-border text-sm">
            {cols.some(c => c.width) && (
              <colgroup>
                {cols.map((c, i) => (
                  <col key={i} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
            )}
            <thead>
              <tr className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {cols.map((c, i) => (
                  <th
                    key={i}
                    className={`border-b border-border px-2 py-1 ${c.alignment === 'right' ? 'text-right' : c.alignment === 'center' ? 'text-center' : ''}`.trim()}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-border first:border-t-0 align-top">
                  {row.children.map((child, i) => {
                    const align = cols[i]?.alignment
                    const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
                    return (
                      <td key={i} className={`px-2 py-1 ${alignCls}`.trim()}>
                        {renderElement(child, i)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )
        break
      }

      const cardCls = contained
        ? 'rounded-md border border-border p-3 bg-background'
        : ''
      const innerColsCls = innerCols && innerCols >= 2
        ? `grid gap-3 grid-cols-1 md:grid-cols-${Math.min(innerCols, 6)}`
        : 'space-y-2'

      const cards = rows.map(row => (
        <div key={row.id} className={`${cardCls} ${innerColsCls}`.trim()}>
          {row.children.map((child, i) => renderElement(child, i))}
        </div>
      ))

      if (gridN && gridN >= 2) {
        const cap = Math.min(gridN, 6)
        body = (
          <div className={`w-full grid gap-3 grid-cols-1 md:grid-cols-${cap}`}>
            {cards}
          </div>
        )
        break
      }

      body = <div className="w-full space-y-3">{cards}</div>
      break
    }

    default:
      body = <span className="text-sm text-muted-foreground">{fallback}</span>
  }

  const copyable = el['copyable'] as { label?: string } | undefined
  const copyValue = el['_formatted'] !== undefined
    ? String(el['_formatted'])
    : value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

  return (
    <EntryShell
      key={index}
      el={el}
      copyValue={copyable !== undefined ? copyValue : undefined}
      copyableLabel={copyable?.label}
    >
      {body}
    </EntryShell>
  )
}

interface EntryShellProps {
  el:             ElementMeta
  copyValue?:     string | undefined
  copyableLabel?: string | undefined
  children:       React.ReactNode
}

function EntryShell({ el, copyValue, copyableLabel, children }: EntryShellProps): React.ReactNode {
  const label       = String(el['label'] ?? '')
  const helperText  = el['helperText'] ? String(el['helperText']) : undefined
  const tooltipText = el['tooltip']    ? String(el['tooltip'])    : undefined
  const inline      = el['inlineLabel'] === true

  const labelNode = label ? (
    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      <span>{label}</span>
      {tooltipText && <EntryTooltip text={tooltipText} />}
    </div>
  ) : null

  const valueRow = (
    <div className="flex items-center gap-2">
      {children}
      {copyValue !== undefined && (
        <EntryCopyButton text={copyValue} label={copyableLabel ?? 'Copy'} />
      )}
    </div>
  )

  if (inline) {
    return (
      <div className="flex items-baseline gap-3">
        {labelNode && <div className="min-w-32">{labelNode}</div>}
        <div className="min-w-0 flex-1">
          {valueRow}
          {helperText && <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {labelNode}
      {valueRow}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  )
}

function EntryComponentError({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      {children}
    </div>
  )
}

function EntryTooltip({ text }: { text: string }): React.ReactNode {
  const trigger = (
    <button
      type="button"
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[10px] text-muted-foreground"
      aria-label={text}
    >
      ?
    </button>
  )
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={() => trigger} />
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function EntryCopyButton({ text, label }: { text: string; label: string }): React.ReactNode {
  const [copied, setCopied] = useState(false)
  const handleClick = () => {
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
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  )
}
