import { colors, HUE_NAMES, type ColorScale } from './colors.js'
import type { BaseColor, HueColor, ChartColor, PresetDefinition } from './types.js'
import { parseSeedToScale } from './generate-scale.js'

/**
 * Chart color resolution — produces single-hue 5-step ramps for `--chart-1..5`.
 *
 * Steps are spread across the full scale (300 → 900) instead of using
 * adjacent steps, so even chart-1 vs chart-2 has obvious contrast in a
 * 2-series chart. Earlier we used 700/600/500/400/300 which produced
 * near-identical bars when the chart color resolved to a low-chroma neutral.
 *
 * Light mode: light → dark (chart-1 reads lightest, chart-5 darkest).
 * Dark mode:  the spread inverts so chart-1 is the lightest visible tone
 *             against the dark background.
 *
 * The `'base'` sentinel ramps through the current base color's scale, giving
 * the calm monochrome charts shown in the reference design when no hue is
 * picked.
 */

function buildChartRamp(scale: ColorScale): PresetDefinition {
  return {
    light: {
      '--chart-1': scale[300],
      '--chart-2': scale[500],
      '--chart-3': scale[700],
      '--chart-4': scale[800],
      '--chart-5': scale[900],
    },
    dark: {
      '--chart-1': scale[200],
      '--chart-2': scale[400],
      '--chart-3': scale[500],
      '--chart-4': scale[700],
      '--chart-5': scale[900],
    },
  }
}

const chartColorMap: Record<HueColor, PresetDefinition> = Object.fromEntries(
  HUE_NAMES.map(name => [name, buildChartRamp(colors[name])]),
) as Record<HueColor, PresetDefinition>

export function resolveChartColor(chartColor: ChartColor, baseColor: BaseColor): PresetDefinition {
  if (chartColor === 'base') return buildChartRamp(colors[baseColor])
  if (chartColor in chartColorMap) return chartColorMap[chartColor as HueColor]
  const synthetic = parseSeedToScale(chartColor)
  return synthetic ? buildChartRamp(synthetic) : buildChartRamp(colors[baseColor])
}
