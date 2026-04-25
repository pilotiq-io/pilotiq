import { colors, type ColorScale } from './colors.js'
import type { BaseColor, PresetDefinition } from './types.js'

/**
 * Base color overrides — each derived from a `ColorScale` in `colors.ts`.
 * Defines bg / fg / card / muted / secondary / accent / border / sidebar tokens.
 * Primary, ring, and chart tokens are owned by the theme/chart color layers.
 */

const TRANSLUCENT_BORDER = 'oklch(1 0 0 / 10%)'
const TRANSLUCENT_INPUT  = 'oklch(1 0 0 / 15%)'

function buildBase(scale: ColorScale): PresetDefinition {
  return {
    light: {
      '--background':                   scale[50],
      '--foreground':                   scale[950],
      '--card':                         scale[50],
      '--card-foreground':              scale[950],
      '--popover':                      scale[50],
      '--popover-foreground':           scale[950],
      '--secondary':                    scale[100],
      '--secondary-foreground':         scale[900],
      '--muted':                        scale[100],
      '--muted-foreground':             scale[500],
      '--accent':                       scale[100],
      '--accent-foreground':            scale[900],
      '--border':                       scale[200],
      '--input':                        scale[200],
      '--sidebar':                      scale[50],
      '--sidebar-foreground':           scale[950],
      '--sidebar-accent':               scale[100],
      '--sidebar-accent-foreground':    scale[900],
      '--sidebar-border':               scale[200],
    },
    dark: {
      '--background':                   scale[950],
      '--foreground':                   scale[50],
      '--card':                         scale[900],
      '--card-foreground':              scale[50],
      '--popover':                      scale[900],
      '--popover-foreground':           scale[50],
      '--secondary':                    scale[800],
      '--secondary-foreground':         scale[50],
      '--muted':                        scale[800],
      '--muted-foreground':             scale[400],
      '--accent':                       scale[800],
      '--accent-foreground':            scale[50],
      '--border':                       TRANSLUCENT_BORDER,
      '--input':                        TRANSLUCENT_INPUT,
      '--sidebar':                      scale[900],
      '--sidebar-foreground':           scale[50],
      '--sidebar-accent':               scale[800],
      '--sidebar-accent-foreground':    scale[50],
      '--sidebar-border':               TRANSLUCENT_BORDER,
    },
  }
}

export const baseColors: Record<BaseColor, PresetDefinition> = {
  neutral: buildBase(colors.neutral),
  stone:   buildBase(colors.stone),
  zinc:    buildBase(colors.zinc),
  mauve:   buildBase(colors.mauve),
  olive:   buildBase(colors.olive),
  mist:    buildBase(colors.mist),
  taupe:   buildBase(colors.taupe),
}
