import { colors, HUE_NAMES, type ColorScale } from './colors.js'
import type { BaseColor, HueColor, ThemeColor, PresetDefinition } from './types.js'
import { parseSeedToScale } from './generate-scale.js'

/**
 * Theme (primary) color resolution.
 *
 * The theme color drives `--primary`, `--primary-foreground`, `--ring`, and
 * the matching sidebar variants. Built from a `ColorScale` so adding a new
 * hue is just adding an entry to `colors.ts`.
 *
 * The `'base'` sentinel means "use the current base color" — resolution
 * pulls the matching scale from `colors[baseColor]` at call time.
 *
 * Custom seeds (raw hex / oklch strings outside the `HueColor` union) are
 * parsed into a synthetic 50…950 scale via `parseSeedToScale`.
 */

/**
 * Build the primary/ring overrides for a given color scale.
 *
 * `isBase` toggles between two strategies:
 *  - **base sentinel** (e.g. Theme = "Neutral"): use the strongest contrast
 *    *within the same scale* — primary is scale[900] in light, scale[50] in
 *    dark. Matches shadcn's neutral theme behavior (very dark/light primary).
 *  - **hue** (e.g. Theme = "Blue"): use scale[600] in BOTH light and dark so
 *    the brand color stays consistent across modes (instead of lifting to
 *    scale[400] in dark, which dilutes brand identity). Foreground stays the
 *    near-white neutral[50] for AA contrast against the saturated mid-tone.
 */
function buildTheme(scale: ColorScale, isBase = false): PresetDefinition {
  if (isBase) {
    return {
      light: {
        '--primary':                      scale[900],
        '--primary-foreground':           scale[50],
        '--ring':                         scale[400],
        '--sidebar-primary':              scale[900],
        '--sidebar-primary-foreground':   scale[50],
        '--sidebar-ring':                 scale[400],
      },
      dark: {
        '--primary':                      scale[50],
        '--primary-foreground':           scale[900],
        '--ring':                         scale[600],
        '--sidebar-primary':              scale[50],
        '--sidebar-primary-foreground':   scale[900],
        '--sidebar-ring':                 scale[600],
      },
    }
  }
  return {
    light: {
      '--primary':                      scale[600],
      '--primary-foreground':           colors.neutral[50],
      '--ring':                         scale[600],
      '--sidebar-primary':              scale[600],
      '--sidebar-primary-foreground':   colors.neutral[50],
      '--sidebar-ring':                 scale[600],
    },
    dark: {
      '--primary':                      scale[600],
      '--primary-foreground':           colors.neutral[50],
      '--ring':                         scale[600],
      '--sidebar-primary':              scale[600],
      '--sidebar-primary-foreground':   colors.neutral[50],
      '--sidebar-ring':                 scale[600],
    },
  }
}

const themeColorMap: Record<HueColor, PresetDefinition> = Object.fromEntries(
  HUE_NAMES.map(name => [name, buildTheme(colors[name])]),
) as Record<HueColor, PresetDefinition>

/**
 * Resolve a theme color value to its CSS variable overrides.
 *
 * @param themeColor  selected value — `'base'`, a known hue, or a raw seed string
 * @param baseColor   current base color (used to resolve `'base'` sentinel)
 */
export function resolveThemeColor(themeColor: ThemeColor, baseColor: BaseColor): PresetDefinition {
  if (themeColor === 'base') return buildTheme(colors[baseColor], true)
  if (themeColor in themeColorMap) return themeColorMap[themeColor as HueColor]
  // Custom seed — parse and synthesize a scale.
  const synthetic = parseSeedToScale(themeColor)
  return synthetic ? buildTheme(synthetic) : buildTheme(colors[baseColor], true)
}
