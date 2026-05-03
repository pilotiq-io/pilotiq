import React from 'react'
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

const COLOR_SPARKLINE_CLASSES: Record<StatColor, string> = {
  default:     'text-muted-foreground',
  primary:     'text-primary',
  success:     'text-emerald-500',
  warning:     'text-amber-500',
  destructive: 'text-red-500',
  info:        'text-blue-500',
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
        <Sparkline values={stat.chart} className={COLOR_SPARKLINE_CLASSES[color]} />
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
  values:    number[]
  className: string
}

/**
 * Inline-SVG sparkline. Sized fluidly via `viewBox` + `preserveAspectRatio`
 * — the parent card sets the rendered height. No deps, no chart lib.
 *
 * Single-value series renders a flat horizontal line at mid-height; flat
 * series (all values equal) likewise — avoids divide-by-zero when the
 * range collapses.
 */
function Sparkline({ values, className }: SparklineProps) {
  if (values.length === 0) return null
  const W = 100
  const H = 30
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = values.length > 1 ? W / (values.length - 1) : 0
  const points = values.map((v, i) => {
    const x = stepX === 0 ? W / 2 : i * stepX
    const y = H - ((v - min) / range) * H
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`mt-2 h-8 w-full ${className}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
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
