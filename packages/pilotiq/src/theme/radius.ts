import type { RadiusPreset } from './types.js'

/**
 * Maps radius preset names to CSS values.
 *
 * `'default'` is a sentinel synonym for `'medium'` (10px) — both render the
 * same radius. The picker shows it as the first option and as the "no
 * explicit choice" label so users see "Default" rather than a specific size
 * when they haven't overridden anything.
 */
export const radiusMap: Record<RadiusPreset, string> = {
  default: '0.625rem',
  none:    '0px',
  small:   '0.25rem',
  medium:  '0.625rem',
  large:   '1.5rem',
}
