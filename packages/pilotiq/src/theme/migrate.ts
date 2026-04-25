import type { ThemeConfig } from './types.js'

/**
 * Read-side migration shim — translates legacy theme override shapes from the
 * `panelGlobal` table into the current `ThemeConfig` schema. Pure function;
 * no DB writes. The next time the editor saves, the row lands in the new
 * shape and the shim becomes a no-op for that row.
 *
 * Handles renames (`accentColor` → `themeColor`, `chartPalette` → `chartColor`),
 * dropped values (`preset: 'default'`, `baseColor: 'slate'/'cream'/'default'`,
 * `accentColor: 'terracotta'`, multi-hue chart palettes), and the `'base'`
 * sentinel that replaces several old defaults.
 */
export function migrateThemeOverrides(raw: unknown): Partial<ThemeConfig> {
  if (!raw || typeof raw !== 'object') return {}
  const input = raw as Record<string, unknown>
  const out: Partial<ThemeConfig> & Record<string, unknown> = {}

  // ── preset ─────────────────────────────────────────────
  // 'default' (Pilotiq brand) → 'vega'. Other names ('nova'/'maia'/'lyra')
  // were placeholders that mapped to neutral defaults — they survive the
  // rename intact (still valid in the new union).
  if (typeof input.preset === 'string') {
    out.preset = input.preset === 'default' ? 'vega' : input.preset as NonNullable<ThemeConfig['preset']>
  }

  // ── baseColor ──────────────────────────────────────────
  // 'slate' → 'mist' (closest cool-gray match)
  // 'cream' → drop (Vega preset's bg already supplies it; layering would be redundant)
  // 'default' → drop (was a no-op sentinel; "no override" is just the field absent)
  if (typeof input.baseColor === 'string') {
    if (input.baseColor === 'slate') out.baseColor = 'mist'
    else if (input.baseColor !== 'cream' && input.baseColor !== 'default') {
      out.baseColor = input.baseColor as NonNullable<ThemeConfig['baseColor']>
    }
  }

  // ── accentColor → themeColor ───────────────────────────
  // 'terracotta' → 'base' when preset=vega (it's the Vega preset's own primary),
  //              → 'orange' otherwise (closest hue match).
  if (typeof input.accentColor === 'string') {
    if (input.accentColor === 'terracotta') {
      out.themeColor = out.preset === 'vega' ? 'base' : 'orange'
    } else {
      out.themeColor = input.accentColor as NonNullable<ThemeConfig['themeColor']>
    }
  }
  // If new shape is already present (writes from the new editor), prefer it.
  if (typeof input.themeColor === 'string') {
    out.themeColor = input.themeColor as NonNullable<ThemeConfig['themeColor']>
  }

  // ── chartPalette → chartColor ──────────────────────────
  // Multi-hue palettes collapse to single-hue closest match.
  if (typeof input.chartPalette === 'string') {
    const map: Record<string, NonNullable<ThemeConfig['chartColor']>> = {
      ocean:      'sky',
      sunset:     'orange',
      forest:     'emerald',
      berry:      'fuchsia',
      terracotta: 'base',
      default:    'base',
    }
    out.chartColor = map[input.chartPalette] ?? (input.chartPalette as NonNullable<ThemeConfig['chartColor']>)
  }
  if (typeof input.chartColor === 'string') {
    out.chartColor = input.chartColor as NonNullable<ThemeConfig['chartColor']>
  }

  // ── pass-through fields ────────────────────────────────
  if (typeof input.radius === 'string')      out.radius      = input.radius as NonNullable<ThemeConfig['radius']>
  if (typeof input.iconLibrary === 'string') out.iconLibrary = input.iconLibrary as NonNullable<ThemeConfig['iconLibrary']>
  if (input.fonts && typeof input.fonts === 'object') {
    out.fonts = input.fonts as NonNullable<ThemeConfig['fonts']>
  }
  if (input.cssVariables && typeof input.cssVariables === 'object') {
    out.cssVariables = input.cssVariables as NonNullable<ThemeConfig['cssVariables']>
  }

  return out
}
