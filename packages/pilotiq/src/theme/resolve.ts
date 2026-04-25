import type { ThemeConfig, ThemeMeta, BaseColor } from './types.js'
import { presets, PRESET_FONTS, PRESET_RADIUS } from './presets.js'
import { baseColors } from './base-colors.js'
import { resolveThemeColor } from './theme-colors.js'
import { resolveChartColor } from './chart-colors.js'
import { radiusMap } from './radius.js'

/**
 * Resolves a user-facing `ThemeConfig` into a serializable `ThemeMeta`.
 *
 * Layering order (each overrides the previous):
 * 1. Preset (full variable set)
 * 2. Base color (gray/neutral overrides)
 * 3. Theme color (primary/ring overrides — `'base'` derives from base color)
 * 4. Chart color (chart-1..5 ramp — `'base'` derives from base color)
 * 5. Raw cssVariables escape hatch
 */
export function resolveTheme(config: ThemeConfig): ThemeMeta {
  // 1. Start with preset
  const presetName = config.preset ?? 'vega'
  const preset = presets[presetName] ?? presets.vega
  const light = { ...preset.light }
  const dark  = { ...preset.dark }

  // 2. Apply base color
  const base = config.baseColor ? baseColors[config.baseColor] : undefined
  if (base) {
    Object.assign(light, base.light)
    Object.assign(dark, base.dark)
  }

  // The `'base'` sentinel for theme/chart resolves against the user's chosen
  // base color when set, falling back to neutral when nothing is selected.
  const effectiveBase: BaseColor = config.baseColor ?? 'neutral'

  // 3 + 4. Always apply theme + chart color (default to `'base'` sentinel).
  // We default these so the editor's trigger ("Theme: Neutral", "Chart: Neutral")
  // matches what the resolver actually renders. Otherwise the trigger would
  // show "Neutral" but the preset's hardcoded primary/chart values would
  // still leak through.
  const themeColor = config.themeColor ?? 'base'
  const tc = resolveThemeColor(themeColor, effectiveBase)
  Object.assign(light, tc.light)
  Object.assign(dark, tc.dark)

  const chartColor = config.chartColor ?? 'base'
  const cc = resolveChartColor(chartColor, effectiveBase)
  Object.assign(light, cc.light)
  Object.assign(dark, cc.dark)

  // 5. Raw CSS variable overrides — highest priority escape hatch
  if (config.cssVariables?.light) Object.assign(light, config.cssVariables.light)
  if (config.cssVariables?.dark)  Object.assign(dark, config.cssVariables.dark)

  // Resolve radius — `'default'` (or undefined) routes through PRESET_RADIUS
  // so each style can pick its own baseline (e.g. Maia = large). An explicit
  // pick (none/small/medium/large) always wins over the preset default.
  const isExplicit = config.radius && config.radius !== 'default'
  const radiusKey = isExplicit ? config.radius! : PRESET_RADIUS[presetName]
  const radius = radiusMap[radiusKey]

  // Resolve fonts — fall through to the per-style font pairing in PRESET_FONTS.
  // Field-level fallback (not object-level ??) so `fonts: { body: '...' }`
  // doesn't accidentally drop the heading default.
  const presetFonts = PRESET_FONTS[presetName]
  const fonts = {
    body:    config.fonts?.body    ?? presetFonts.body,
    heading: config.fonts?.heading ?? presetFonts.heading,
  }
  const fontFamily: { heading?: string; body?: string } = {}
  if (fonts.heading) fontFamily.heading = `'${fonts.heading}', system-ui, sans-serif`
  if (fonts.body)    fontFamily.body    = `'${fonts.body}', system-ui, sans-serif`

  const result: ThemeMeta = {
    light,
    dark,
    radius,
    iconLibrary: config.iconLibrary ?? 'lucide',
  }
  result.fonts = fonts
  if (Object.keys(fontFamily).length > 0) result.fontFamily = fontFamily

  return result
}
