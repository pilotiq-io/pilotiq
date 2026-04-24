import type { PanelThemeConfig, PanelThemeMeta } from './types.js'
import { presets } from './presets.js'
import { baseColors } from './base-colors.js'
import { accentColors } from './accent-colors.js'
import { chartPalettes } from './chart-palettes.js'
import { radiusMap } from './radius.js'

/**
 * Resolves a user-facing `PanelThemeConfig` into a serializable `PanelThemeMeta`.
 *
 * Layering order (each overrides the previous):
 * 1. Preset (full variable set)
 * 2. Base color (gray/neutral overrides)
 * 3. Accent color (primary overrides)
 * 4. Chart palette
 * 5. Raw cssVariables escape hatch
 */
export function resolveTheme(config: PanelThemeConfig): PanelThemeMeta {
  // 1. Start with preset
  const preset = presets[config.preset ?? 'default']
  const light = { ...preset.light }
  const dark  = { ...preset.dark }

  // 2. Apply base color
  if (config.baseColor) {
    const base = baseColors[config.baseColor]
    Object.assign(light, base.light)
    Object.assign(dark, base.dark)
  }

  // 3. Apply accent color
  if (config.accentColor) {
    const accent = accentColors[config.accentColor]
    Object.assign(light, accent.light)
    Object.assign(dark, accent.dark)
  }

  // 4. Apply chart palette
  if (config.chartPalette) {
    const charts = chartPalettes[config.chartPalette]
    Object.assign(light, charts.light)
    Object.assign(dark, charts.dark)
  }

  // 5. Apply raw CSS variable overrides (escape hatch — highest priority)
  if (config.cssVariables?.light) Object.assign(light, config.cssVariables.light)
  if (config.cssVariables?.dark)  Object.assign(dark, config.cssVariables.dark)

  // Resolve radius — 'medium' is the pilotiq brand default
  const radius = radiusMap[config.radius ?? 'medium']

  // Resolve fonts — Satoshi is the pilotiq brand default for both body and heading.
  // Field-level fallback (not object-level ??) so `fonts: {}` still triggers the default.
  const fonts = {
    body:    config.fonts?.body    ?? 'Satoshi',
    heading: config.fonts?.heading ?? 'Satoshi',
  }
  const fontFamily: { heading?: string; body?: string } = {}
  if (fonts.heading) fontFamily.heading = `'${fonts.heading}', system-ui, sans-serif`
  if (fonts.body)    fontFamily.body    = `'${fonts.body}', system-ui, sans-serif`

  const result: PanelThemeMeta = {
    light,
    dark,
    radius,
    iconLibrary: config.iconLibrary ?? 'lucide',
  }
  result.fonts = fonts
  if (Object.keys(fontFamily).length > 0) result.fontFamily = fontFamily

  return result
}
