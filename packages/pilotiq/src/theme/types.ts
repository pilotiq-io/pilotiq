import { BASE_COLOR_NAMES, HUE_NAMES } from './colors.js'

// ─── Style Presets ─────────────────────────────────────────

/** Built-in style presets — each defines a complete set of OKLCH CSS variables.
 *  `vega` is the Pilotiq brand (terracotta on cream, Satoshi). The other six are
 *  placeholder neutrals awaiting visual differentiation. */
export type StylePreset = 'vega' | 'nova' | 'maia' | 'lyra' | 'mira' | 'luma' | 'sera'

// ─── Base Colors (gray/neutral scales) ─────────────────────

/** Base color scale — controls the neutral/gray tones across the UI. */
export type BaseColor = typeof BASE_COLOR_NAMES[number]

// ─── Theme + Chart Colors ──────────────────────────────────

/** Hue tokens shared by both the Theme color and Chart color pickers. */
export type HueColor = typeof HUE_NAMES[number]

/** Theme (primary) color — drives buttons, links, active states, ring.
 *  `'base'` means "use the current base color's hue". Strings outside the
 *  union are treated as raw hex/oklch seeds (custom color escape hatch). */
export type ThemeColor = 'base' | HueColor | (string & {})

/** Chart palette color — drives `--chart-1..5` as a single-hue ramp.
 *  Same shape as `ThemeColor`. */
export type ChartColor = ThemeColor

// ─── Radius ────────────────────────────────────────────────

/** Border radius preset. */
export type RadiusPreset = 'none' | 'small' | 'default' | 'medium' | 'large' | 'xlarge'

// ─── Spacing (UI density) ──────────────────────────────────

/** Spacing density preset — drives Tailwind's `--spacing` multiplier so every
 *  `p-*`, `gap-*`, `m-*` utility scales uniformly across the panel. */
export type SpacingPreset = 'default' | 'compact' | 'comfortable'

// ─── Icon Library ──────────────────────────────────────────

/** Icon library identifier — controls which icon set is resolved. */
export type IconLibrary = 'lucide' | 'tabler' | 'remix' | 'phosphor'

// ─── Fonts ─────────────────────────────────────────────────

export interface ThemeFonts {
  /** Google Fonts family name for headings, e.g. 'Space Grotesk'. */
  heading?: string
  /** Google Fonts family name for body text, e.g. 'Inter'. */
  body?: string
}

// ─── Theme Config (user-facing) ────────────────────────────

/**
 * Theme configuration — passed to `Pilotiq.theme()`.
 *
 * @example
 * ```ts
 * Pilotiq.make('admin').theme({
 *   preset: 'vega',
 *   baseColor: 'taupe',
 *   themeColor: 'orange',
 *   chartColor: 'base',
 *   radius: 'medium',
 *   fonts: { heading: 'Space Grotesk', body: 'Inter' },
 * })
 * ```
 */
export interface ThemeConfig {
  /** Style preset — sets all CSS variables at once. Defaults to `'vega'`. */
  preset?:      StylePreset
  /** Base color scale — overrides neutral/gray tones from the preset. */
  baseColor?:   BaseColor
  /** Theme (primary) color. `'base'` = derive from current base color. */
  themeColor?:  ThemeColor
  /** Chart color. `'base'` = derive ramp from current base color. */
  chartColor?:  ChartColor
  /** Border radius preset. Defaults to `'medium'` (Pilotiq brand). */
  radius?:      RadiusPreset
  /** Spacing density preset. `'default'` falls through to the per-style value
   *  in `PRESET_SPACING` (e.g. Mira → compact, Vega → comfortable). */
  spacing?:     SpacingPreset
  /** Font families (loaded from Google Fonts / Fontshare). */
  fonts?:       ThemeFonts
  /** Icon library. */
  iconLibrary?: IconLibrary
  /** Escape hatch: raw CSS variable overrides in OKLCH. Applied last, highest priority. */
  cssVariables?: {
    light?: Record<string, string>
    dark?:  Record<string, string>
  }
}

// ─── Theme Meta (serialized, server → client) ──────────────

/** Resolved theme data sent from server to client via viewProps. */
export interface ThemeMeta {
  /** CSS variable map for :root (light mode). Keys are CSS custom property names. */
  light: Record<string, string>
  /** CSS variable map for .dark (dark mode). */
  dark:  Record<string, string>
  /** Border radius value (e.g. '0.625rem'). */
  radius: string
  /** Spacing multiplier for Tailwind's `--spacing` token (e.g. '0.25rem'). */
  spacing: string
  /** Google Fonts families to load via <link> tag. */
  fonts?: ThemeFonts
  /** Font family CSS values with fallbacks (e.g. "'Inter', sans-serif"). */
  fontFamily?: {
    heading?: string
    body?:    string
  }
  /** Icon library identifier for frontend icon resolution. */
  iconLibrary: IconLibrary
}

// ─── Preset Definition ─────────────────────────────────────

/** A complete set of CSS variable values for light and dark modes (OKLCH strings). */
export interface PresetDefinition {
  light: Record<string, string>
  dark:  Record<string, string>
}
