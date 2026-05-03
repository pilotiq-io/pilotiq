import type { ElementMeta } from '@pilotiq/pilotiq'

/**
 * Chart-type whitelist. v1 ships renderers for `line / bar / pie /
 * doughnut`; the four others (`radar / polar / scatter / bubble`) are
 * accepted at the type-level so consumers don't have a typings break
 * later — the renderer surfaces a "type not yet supported" message
 * until those mappings land.
 */
export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'polar'
  | 'scatter'
  | 'bubble'

export const CHART_TYPES: readonly ChartType[] = [
  'line', 'bar', 'pie', 'doughnut', 'radar', 'polar', 'scatter', 'bubble',
] as const

/** Chart.js-shaped data envelope. The renderer normalizes this into
 *  Recharts' row-shape internally so consumer-facing data stays the
 *  same if a future `@pilotiq/chartjs` adapter swaps in. */
export interface ChartDataset {
  label: string
  data:  number[]
  /** Optional per-dataset color — overrides the chart-level color when
   *  set. Accepts any CSS color string. */
  color?: string
}

export interface ChartData {
  labels:   string[]
  datasets: ChartDataset[]
}

/** Pilotiq color tokens (subset of `StatColor`) accepted on Chart.color. */
export type ChartColor =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'

export const CHART_COLORS: readonly ChartColor[] = [
  'default', 'primary', 'success', 'warning', 'destructive', 'info',
] as const

/** Wire-shape stamped on the Chart element's meta after `toMeta()` runs.
 *  The renderer reads everything off here. `serverData / id / poll /
 *  lazy / widgetUrl` come from `ServerDataElement`'s post-stamp pass. */
export interface ChartMeta extends ElementMeta {
  type:           'chart'
  chartType:      ChartType
  label?:         string
  color?:         ChartColor
  maxHeight?:     number
  options?:       Record<string, unknown>
  filters?:       Record<string, string>
  defaultFilter?: string
}
