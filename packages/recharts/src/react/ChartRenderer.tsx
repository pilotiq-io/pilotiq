import React, { useId, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { useWidgetData } from '@pilotiq/pilotiq/react'
import type { WidgetMetaLike, WidgetRendererProps } from '@pilotiq/pilotiq/react'
import type {
  ChartColor,
  ChartData,
  ChartDataset,
  ChartMeta,
  ChartType,
} from '../types.js'

/**
 * Plan #15 Phase C — `ChartRenderer`. Mounted via the widget renderer
 * registry once `registerChartRenderer()` runs at app boot. Reads the
 * resolved `_widgetData[id]` payload through `useWidgetData`, paints a
 * skeleton while the lazy fetch is in flight, and renders one of four
 * v1 chart types via Recharts (`line / bar / pie / doughnut`).
 *
 * Filter dropdown re-fetches with `{ filter }` body — the server stamps
 * `ctx.filter` and `Chart.resolveServerData` branches on it.
 */

// ─── Color tokens ─────────────────────────────────────────────────
// The theme chart palette (`--chart-1..5`) is the default source so the
// "Chart Color" theme setting actually drives every chart — matching the
// theme-editor preview. The semantic `COLOR_VAR` map is kept only as an
// explicit per-chart override (`Chart.color('primary')`).
const PALETTE: string[] = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const COLOR_VAR: Record<ChartColor, string> = {
  default:     'var(--chart-1)',
  primary:     'var(--primary)',
  success:     'oklch(0.65 0.18 150)',
  warning:     'oklch(0.75 0.18 75)',
  destructive: 'oklch(0.62 0.22 25)',
  info:        'oklch(0.65 0.18 240)',
}

const CARD_BORDER: Record<ChartColor, string> = {
  default:     'border-border',
  primary:     'border-primary/30',
  success:     'border-emerald-500/40',
  warning:     'border-amber-500/40',
  destructive: 'border-red-500/40',
  info:        'border-blue-500/40',
}

export function ChartRenderer({ meta }: WidgetRendererProps) {
  const m = meta as ChartMeta
  const color = (m.color ?? 'default') as ChartColor
  const maxHeight = typeof m.maxHeight === 'number' ? m.maxHeight : 320
  const label = m.label
  const filters = m.filters
  const defaultFilter = m.defaultFilter

  const [activeFilter, setActiveFilter] = useState<string | undefined>(defaultFilter)
  const { data, error, isLoading, refetch } = useWidgetData(meta as unknown as WidgetMetaLike)

  const onFilterChange = (next: string): void => {
    setActiveFilter(next)
    refetch(next)
  }

  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm ${CARD_BORDER[color]}`}>
      {(label || filters) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {label && <h3 className="text-sm font-semibold text-foreground">{label}</h3>}
          {filters && (
            <>
              {/* Desktop: segmented toggle (shadcn ToggleGroup style). */}
              <ChartFilterToggle filters={filters} active={activeFilter} onChange={onFilterChange} />
              {/* Mobile: compact select — the toggle needs width the narrow
                  card doesn't have. */}
              <ChartFilterDropdown filters={filters} active={activeFilter} onChange={onFilterChange} />
            </>
          )}
        </div>
      )}
      <div style={{ height: maxHeight }}>
        {isLoading
          ? <ChartSkeleton />
          : error
            ? <ChartError message={error} />
            : <ChartBody chartType={m.chartType} data={readChartData(data)} color={color} options={m.options ?? {}} />}
      </div>
    </div>
  )
}

// ─── Body — dispatches per chart type ─────────────────────────────

interface ChartBodyProps {
  chartType: ChartType
  data:      ChartData
  color:     ChartColor
  options:   Record<string, unknown>
}

function ChartBody({ chartType, data, color, options }: ChartBodyProps) {
  if (data.labels.length === 0 || data.datasets.length === 0) {
    return <ChartEmpty />
  }

  switch (chartType) {
    case 'line':     return <LineChartView     data={data} color={color} options={options} />
    case 'bar':      return <BarChartView      data={data} color={color} options={options} />
    case 'pie':      return <PieChartView      data={data} color={color} options={options} doughnut={false} />
    case 'doughnut': return <PieChartView      data={data} color={color} options={options} doughnut={true}  />
    default:
      return <ChartUnsupported chartType={chartType} />
  }
}

// ─── Shared minimal chrome ────────────────────────────────────────
// Clean, preview-matching axes: no tick/axis lines, no value-grid, no Y
// axis; tooltip styled with theme surface vars.
//
// Returns an ARRAY (not a wrapper component / Fragment) so the elements
// land as DIRECT children of the chart when spread via `{minimalAxes()}`.
// Recharts detects axes/tooltip by scanning the chart's direct children
// by type — wrapping them in a custom component or a Fragment hides them,
// so the X-axis ticks (and tooltip) silently never render.
function minimalAxes(): React.ReactNode[] {
  return [
    <XAxis
      key="x"
      dataKey="__label"
      tickLine={false}
      axisLine={false}
      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
      tickMargin={8}
      minTickGap={24}
      interval="preserveStartEnd"
      height={24}
    />,
    <YAxis key="y" hide />,
    <Tooltip
      key="t"
      cursor={{ fill: 'var(--muted)', opacity: 0.35 }}
      contentStyle={{
        background:    'var(--popover)',
        border:        '1px solid var(--border)',
        borderRadius:  8,
        fontSize:      12,
        color:         'var(--popover-foreground)',
        boxShadow:     '0 4px 12px rgb(0 0 0 / 0.08)',
      }}
      labelStyle={{ color: 'var(--muted-foreground)' }}
    />,
  ]
}

// ─── Line (rendered as a soft area) ───────────────────────────────

interface LineChartViewProps {
  data:    ChartData
  color:   ChartColor
  options: Record<string, unknown>
}

function LineChartView({ data, color, options }: LineChartViewProps) {
  const rows = useMemo(() => toRows(data), [data])
  // Unique gradient id namespace so multiple charts on a page don't
  // collide on `<defs>` ids.
  const gid = useId().replace(/:/g, '')
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <defs>
          {data.datasets.map((ds, i) => {
            const c = resolveSeriesColor(ds, color, i)
            return (
              <linearGradient key={ds.label} id={`pq-${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={c} stopOpacity={0.28} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>
        {minimalAxes()}
        {data.datasets.length > 1 && <Legend />}
        {data.datasets.map((ds, i) => (
          <Area
            key={ds.label}
            // `monotone` (not `natural`): natural overshoots below the data
            // baseline on sparse/spiky series, drawing fake dips that clip at
            // the bottom. monotone stays within the data bounds.
            type="monotone"
            dataKey={ds.label}
            stroke={resolveSeriesColor(ds, color, i)}
            strokeWidth={2}
            fill={`url(#pq-${gid}-${i})`}
            dot={false}
            {...options}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Bar ────────────────────────────────────────────────────────

function BarChartView({ data, color, options }: LineChartViewProps) {
  const rows = useMemo(() => toRows(data), [data])
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {minimalAxes()}
        {data.datasets.length > 1 && <Legend />}
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={resolveSeriesColor(ds, color, i)}
            radius={[4, 4, 0, 0]}
            {...options}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Pie / Doughnut ─────────────────────────────────────────────

interface PieChartViewProps {
  data:     ChartData
  color:    ChartColor
  options:  Record<string, unknown>
  doughnut: boolean
}

function PieChartView({ data, color, options, doughnut }: PieChartViewProps) {
  // Pie/doughnut consumes the first dataset only — multi-series pie is
  // a stacked-by-label primitive that needs different config; the
  // common case is "labels = slice names, dataset[0].data = values".
  const ds = data.datasets[0]
  const slices = useMemo(
    () => (ds ? data.labels.map((label, i) => ({ name: label, value: ds.data[i] ?? 0 })) : []),
    [data.labels, ds],
  )
  if (!ds) return <ChartEmpty />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip />
        <Legend verticalAlign="bottom" height={24} />
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={doughnut ? '60%' : 0}
          outerRadius="80%"
          fill={COLOR_VAR[color]}
          {...options}
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length] ?? COLOR_VAR[color]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

interface RechartsRow {
  __label: string
  [series: string]: number | string
}

/** Normalize Chart.js-shaped data to Recharts row-shape. Reserved key
 *  `__label` carries the X-axis category — series names slot in beside
 *  it. Underscore-prefixed to dodge a real-world dataset accidentally
 *  named `name` colliding with Recharts' `<XAxis dataKey>` lookup. */
function toRows(data: ChartData): RechartsRow[] {
  const rows: RechartsRow[] = []
  for (let i = 0; i < data.labels.length; i++) {
    const row: RechartsRow = { __label: String(data.labels[i] ?? '') }
    for (const ds of data.datasets) {
      row[ds.label] = ds.data[i] ?? 0
    }
    rows.push(row)
  }
  return rows
}

function resolveSeriesColor(ds: ChartDataset, color: ChartColor, index: number): string {
  // Explicit per-dataset color wins; then an explicit (non-default)
  // chart-level semantic color claims the primary series; otherwise the
  // theme chart palette drives every series by index.
  if (ds.color) return ds.color
  if (index === 0 && color !== 'default') return COLOR_VAR[color]
  return PALETTE[index % PALETTE.length] ?? COLOR_VAR[color]
}

function readChartData(raw: unknown): ChartData {
  if (!raw || typeof raw !== 'object') return { labels: [], datasets: [] }
  const r = raw as Partial<ChartData>
  return {
    labels:   Array.isArray(r.labels) ? r.labels.map(l => String(l)) : [],
    datasets: Array.isArray(r.datasets) ? r.datasets : [],
  }
}

// ─── Filter dropdown ────────────────────────────────────────────

interface ChartFilterDropdownProps {
  filters: Record<string, string>
  active:  string | undefined
  onChange: (value: string) => void
}

// Mobile control — a compact select shown below `md`. The segmented
// toggle takes more horizontal room than a narrow card / phone has.
function ChartFilterDropdown({ filters, active, onChange }: ChartFilterDropdownProps) {
  const entries = Object.entries(filters)
  return (
    <select
      value={active ?? entries[0]?.[0] ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Time range"
      className="md:hidden h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {entries.map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  )
}

// Desktop control — a segmented toggle (shadcn ToggleGroup `outline` look):
// a bordered track with the active window highlighted. Hidden below `md`,
// where the select takes over.
function ChartFilterToggle({ filters, active, onChange }: ChartFilterDropdownProps) {
  const entries = Object.entries(filters)
  const current = active ?? entries[0]?.[0]
  return (
    <div
      role="group"
      aria-label="Time range"
      className="hidden md:inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
    >
      {entries.map(([key, label]) => {
        const isActive = current === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Skeleton / error / empty / unsupported ────────────────────

function ChartSkeleton() {
  return (
    <div className="flex h-full w-full items-end gap-2 px-2 pb-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-muted animate-pulse"
          style={{ height: `${30 + ((i * 13) % 60)}%` }}
        />
      ))}
    </div>
  )
}

function ChartError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-red-500/40 bg-red-50 px-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
      Failed to load chart: {message}
    </div>
  )
}

function ChartEmpty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data
    </div>
  )
}

function ChartUnsupported({ chartType }: { chartType: ChartType }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      Chart type <code className="font-mono">{chartType}</code> is not yet supported by{' '}
      <code className="font-mono">@pilotiq/recharts</code>. v1 ships line / bar / pie / doughnut.
    </div>
  )
}
