import React, { useId } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import type { StatColor, StatMeta } from '../../schema/Stat.js'
import { useWidgetData } from '../WidgetDataContext.js'
import { useIconFor } from '../icon-context.js'
import type { SerializedIcon } from '../../icons/types.js'

/**
 * Plan #15 Phase B — `StatsOverviewRenderer`.
 *
 * Reads the resolved `_widgetData[id]` payload through `useWidgetData`,
 * lays out a card grid keyed off `meta.columns`, and falls back to a
 * skeleton row while the lazy fetch is in flight.
 */

const COLOR_CARD_CLASSES: Record<StatColor, string> = {
  default:     'border-border',
  primary:     'border-primary/30',
  success:     'border-emerald-500/40',
  warning:     'border-amber-500/40',
  destructive: 'border-red-500/40',
  info:        'border-blue-500/40',
}

const COLOR_VALUE_CLASSES: Record<StatColor, string> = {
  default:     'text-foreground',
  primary:     'text-primary',
  success:     'text-emerald-600 dark:text-emerald-400',
  warning:     'text-amber-600 dark:text-amber-400',
  destructive: 'text-red-600 dark:text-red-400',
  info:        'text-blue-600 dark:text-blue-400',
}

// Sparkline stroke/fill resolves to a CSS color value (not a Tailwind
// class) so the gradient fill can reference it directly. `default` pulls
// the theme chart palette so neutral stats read on-theme — matching the
// theme-editor preview's filled sparklines.
const SPARKLINE_COLOR: Record<StatColor, string> = {
  default:     'var(--chart-1)',
  primary:     'var(--primary)',
  success:     'oklch(0.65 0.18 150)',
  warning:     'oklch(0.75 0.18 75)',
  destructive: 'oklch(0.62 0.22 25)',
  info:        'oklch(0.65 0.18 240)',
}

export interface StatsOverviewRendererProps {
  meta: ElementMeta
}

export function StatsOverviewRenderer({ meta }: StatsOverviewRendererProps) {
  const columns = clampColumns(meta['columns'])
  const { data, error, isLoading } = useWidgetData(meta as Parameters<typeof useWidgetData>[0])

  if (isLoading) return <StatsSkeleton columns={columns} />
  if (error)     return <StatsError message={error} columns={columns} />

  const stats = readStats(data)
  if (stats.length === 0) return null
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {stats.map((s, i) => <StatCard key={i} stat={s} />)}
    </div>
  )
}

function clampColumns(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 3
  return Math.min(6, Math.max(1, Math.floor(n)))
}

function readStats(data: unknown): StatMeta[] {
  if (!data || typeof data !== 'object') return []
  const stats = (data as { stats?: unknown }).stats
  return Array.isArray(stats) ? (stats as StatMeta[]) : []
}

// ─── Card ─────────────────────────────────────────────────

interface StatCardProps {
  stat: StatMeta
}

function StatCard({ stat }: StatCardProps) {
  const color = stat.color ?? 'default'
  const cardClass    = `rounded-xl border bg-card p-5 shadow-sm transition ${COLOR_CARD_CLASSES[color]}`
  const valueClass   = `text-3xl font-semibold tracking-tight tabular-nums ${COLOR_VALUE_CLASSES[color]}`

  const Inner = (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
        {stat.icon && <StatIcon name={stat.icon} className={`size-5 ${COLOR_VALUE_CLASSES[color]}`} />}
      </div>
      <p className={valueClass}>{formatValue(stat.value)}</p>
      {(stat.description || stat.descriptionIcon) && (
        <StatDescription stat={stat} />
      )}
      {stat.chart && stat.chart.length > 0 && (
        <Sparkline values={stat.chart} color={SPARKLINE_COLOR[color]} />
      )}
    </div>
  )

  const extraAttrs = (stat.extraAttributes ?? {}) as Record<string, unknown>

  if (stat.url) {
    return (
      <a
        href={stat.url}
        target={stat.openInNewTab ? '_blank' : undefined}
        rel={stat.openInNewTab ? 'noopener noreferrer' : undefined}
        className={`${cardClass} block hover:border-foreground/30 hover:shadow-md`}
        {...extraAttrs}
      >
        {Inner}
      </a>
    )
  }

  return <div className={cardClass} {...extraAttrs}>{Inner}</div>
}

function formatValue(v: StatMeta['value']): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  return String(v)
}

function StatDescription({ stat }: { stat: StatMeta }) {
  const icon = stat.descriptionIcon
  const before = icon?.position === 'before'
  const text = stat.description
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon && before && <StatIcon name={icon.name} className="size-3.5" />}
      {text && <span>{text}</span>}
      {icon && !before && <StatIcon name={icon.name} className="size-3.5" />}
    </div>
  )
}

function StatIcon({ name, className }: { name: string; className: string }) {
  // Stats ship icons as registry-name strings; mirror Resource.icon /
  // panel chrome lookup so the same registry serves both. The lookup
  // accepts a `SerializedIcon` shape — wrap the bare string.
  const serialized: SerializedIcon = name
  const Icon = useIconFor(serialized)
  if (!Icon) return null
  return <Icon className={className} aria-hidden />
}

// ─── Sparkline ────────────────────────────────────────────

interface SparklineProps {
  values: number[]
  color:  string
}

/**
 * Inline-SVG sparkline with a soft area-fill gradient under the line —
 * mirrors the theme-editor preview. Sized fluidly via `viewBox` +
 * `preserveAspectRatio`; the parent card sets the rendered height. No
 * deps, no chart lib.
 *
 * Single-value / flat series render a flat line at mid-height (the
 * range floors at 1 to avoid divide-by-zero).
 */
function Sparkline({ values, color }: SparklineProps) {
  const gid = useId().replace(/:/g, '')
  if (values.length === 0) return null
  const W = 100
  const H = 30
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = values.length > 1 ? W / (values.length - 1) : 0
  const pts = values.map((v, i): [number, number] => {
    const x = stepX === 0 ? W / 2 : i * stepX
    const y = H - ((v - min) / range) * H
    return [x, y]
  })
  const first = pts[0]
  if (!first) return null
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area =
    `M${first[0].toFixed(2)},${first[1].toFixed(2)} ` +
    pts.slice(1).map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
    ` L${W},${H} L0,${H} Z`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-2 h-8 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`pq-spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#pq-spark-${gid})`} stroke="none" />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line}
      />
    </svg>
  )
}

// ─── Skeleton + error ─────────────────────────────────────

function StatsSkeleton({ columns }: { columns: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatsError({ message, columns }: { message: string; columns: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <div className="rounded-xl border border-red-500/40 bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
        Failed to load stats: {message}
      </div>
    </div>
  )
}
