import { colors } from './colors.js'
import type { PresetDefinition, StylePreset, ThemeFonts, RadiusPreset } from './types.js'

// Pure white for surfaces that sit ABOVE the sidebar (`--background`, `--card`,
// `--popover`). The sidebar tracks `--muted` (one step darker than white) so
// the sidebar reads as a recessed surface against the bright content area.
const WHITE = 'oklch(1 0 0)'

// ─── Shadcn neutral default ────────────────────────────────
// Exact mapping of `https://ui.shadcn.com/themes` neutral defaults onto our
// color tokens. Both Vega (the seeded default) and the six placeholder
// presets share this baseline; differentiation between styles comes later.

// Note: --primary, --ring, --sidebar-primary*, and --chart-1..5 are
// intentionally omitted here — the theme-color and chart-color resolver
// layers in `resolve.ts` always apply (defaulting to the `'base'` sentinel),
// so anything we'd put for those tokens here would be unconditionally
// overridden. Keeping them out makes the override chain easier to reason
// about.
const shadcnNeutral: PresetDefinition = {
  light: {
    '--background':                   WHITE,
    '--foreground':                   colors.neutral[950],
    '--card':                         WHITE,
    '--card-foreground':              colors.neutral[950],
    '--popover':                      WHITE,
    '--popover-foreground':           colors.neutral[950],
    '--secondary':                    colors.neutral[100],
    '--secondary-foreground':         colors.neutral[900],
    '--muted':                        colors.neutral[100],
    '--muted-foreground':             colors.neutral[500],
    '--accent':                       colors.neutral[100],
    '--accent-foreground':            colors.neutral[900],
    '--destructive':                  colors.red[600],
    // shadcn ships destructive-foreground identical to destructive in light
    // mode — preserves the same red token for both fg and bg surfaces.
    '--destructive-foreground':       colors.red[600],
    '--border':                       colors.neutral[200],
    '--input':                        colors.neutral[200],
    '--sidebar':                      'var(--muted)',
    '--sidebar-foreground':           colors.neutral[950],
    '--sidebar-accent':               colors.neutral[200],
    '--sidebar-accent-foreground':    colors.neutral[900],
    '--sidebar-border':               colors.neutral[200],
  },
  dark: {
    '--background':                   colors.neutral[950],
    '--foreground':                   colors.neutral[50],
    '--card':                         colors.neutral[950],
    '--card-foreground':              colors.neutral[50],
    '--popover':                      colors.neutral[950],
    '--popover-foreground':           colors.neutral[50],
    '--secondary':                    colors.neutral[800],
    '--secondary-foreground':         colors.neutral[50],
    '--muted':                        colors.neutral[800],
    '--muted-foreground':             colors.neutral[400],
    '--accent':                       colors.neutral[800],
    '--accent-foreground':            colors.neutral[50],
    '--destructive':                  colors.red[900],
    '--destructive-foreground':       colors.red[500],
    '--border':                       colors.neutral[800],
    '--input':                        colors.neutral[800],
    '--sidebar':                      'var(--muted)',
    '--sidebar-foreground':           colors.neutral[50],
    '--sidebar-accent':               colors.neutral[700],
    '--sidebar-accent-foreground':    colors.neutral[50],
    '--sidebar-border':               colors.neutral[700],
  },
}

// All seven styles share the shadcn baseline for now. Per-style personality
// (radius, token relationships) lands in a follow-up pass.
export const presets: Record<StylePreset, PresetDefinition> = {
  vega: shadcnNeutral,
  nova: shadcnNeutral,
  maia: shadcnNeutral,
  lyra: shadcnNeutral,
  mira: shadcnNeutral,
  luma: shadcnNeutral,
  sera: shadcnNeutral,
}

/**
 * Per-style default font pairing. Picking a Style updates the Heading + Font
 * pickers automatically (unless the user has explicitly overridden them via
 * `Pilotiq.theme({ fonts: {...} })` or the editor).
 *
 * Currently confirmed:
 *  - vega → Inter
 *  - nova → Geist
 *
 * Placeholder for the others (Inter); replace once the design system
 * specifies a font per style.
 */
export const PRESET_FONTS: Record<StylePreset, Required<ThemeFonts>> = {
  vega: { heading: 'Inter',            body: 'Inter'           },
  nova: { heading: 'Geist',            body: 'Geist'           },
  maia: { heading: 'Figtree',          body: 'Figtree'         },
  lyra: { heading: 'JetBrains Mono',   body: 'JetBrains Mono'  },
  mira: { heading: 'Inter',            body: 'Inter'           },
  luma: { heading: 'Inter',            body: 'Inter'           },
  sera: { heading: 'Playfair Display', body: 'Noto Sans'       },
}

/**
 * Per-style default radius. The picker's "Default" option resolves through
 * this map: with Style = Maia + Radius = Default, the actual rendered radius
 * is `large` (1rem). Picking an explicit radius (e.g. "Small") still
 * overrides this default.
 */
export const PRESET_RADIUS: Record<StylePreset, RadiusPreset> = {
  vega: 'medium',
  nova: 'medium',
  maia: 'large',
  lyra: 'none',
  mira: 'medium',
  luma: 'large',
  sera: 'none',
}
