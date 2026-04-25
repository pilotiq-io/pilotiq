import type { SpacingPreset } from './types.js'

/**
 * Maps spacing density presets to Tailwind v4 `--spacing` values.
 *
 * Tailwind compiles every `p-*`, `gap-*`, `m-*` utility as
 * `calc(var(--spacing) * N)`, so swapping this single token uniformly tightens
 * or loosens every gap and padding in the panel — no per-component edits.
 *
 * `'default'` is the sentinel resolver; the picker shows it as the first
 * option and falls through to `PRESET_SPACING[preset]`. `0.25rem` matches
 * Tailwind's stock value, kept as `default`'s rendered fallback for parity.
 */
export const spacingMap: Record<SpacingPreset, string> = {
  default:     '0.25rem',
  compact:     '0.2rem',
  comfortable: '0.3rem',
}
