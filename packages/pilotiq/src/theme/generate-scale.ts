import type { ColorScale, ColorStep } from './colors.js'

/**
 * Custom-color seed parsing — converts a hex (#RRGGBB) or `oklch(L C H)` string
 * into a synthetic 50…950 ColorScale by holding hue+chroma constant and
 * ramping lightness across a fixed curve.
 *
 * The seed's own lightness is discarded — only hue and chroma contribute.
 * Returns `null` for unparseable input; the caller falls back to the base scale.
 *
 * Limitations:
 *  - Highly chromatic seeds (C > ~0.25) may go out of gamut at extreme
 *    lightness steps; the browser will clip. Use the `cssVariables` raw
 *    escape hatch for surgical control if this matters.
 *  - Alpha values are not supported.
 */

const TARGET_LIGHTNESS: Record<ColorStep, number> = {
  50:  0.985,
  100: 0.96,
  200: 0.91,
  300: 0.85,
  400: 0.75,
  500: 0.65,
  600: 0.55,
  700: 0.48,
  800: 0.40,
  900: 0.34,
  950: 0.25,
}

function hexToLinearRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null
  const r = parseInt(cleaned.slice(0, 2), 16) / 255
  const g = parseInt(cleaned.slice(2, 4), 16) / 255
  const b = parseInt(cleaned.slice(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return [toLinear(r), toLinear(g), toLinear(b)]
}

function linearRgbToOklch(lr: number, lg: number, lb: number): [number, number, number] {
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L  = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a  = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  const C = Math.sqrt(a * a + b2 * b2)
  let H = Math.atan2(b2, a) * 180 / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}

function parseOklchString(s: string): [number, number, number] | null {
  const match = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/i)
  if (!match) return null
  return [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)]
}

export function parseSeedToScale(seed: string): ColorScale | null {
  let lch: [number, number, number] | null = null

  if (seed.startsWith('#')) {
    const rgb = hexToLinearRgb(seed)
    if (rgb) lch = linearRgbToOklch(rgb[0], rgb[1], rgb[2])
  } else if (seed.toLowerCase().startsWith('oklch')) {
    lch = parseOklchString(seed)
  }

  if (!lch) return null

  const C = lch[1]
  const H = lch[2]

  const fmt = (l: number) => `oklch(${l.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`

  return {
    50:  fmt(TARGET_LIGHTNESS[50]),
    100: fmt(TARGET_LIGHTNESS[100]),
    200: fmt(TARGET_LIGHTNESS[200]),
    300: fmt(TARGET_LIGHTNESS[300]),
    400: fmt(TARGET_LIGHTNESS[400]),
    500: fmt(TARGET_LIGHTNESS[500]),
    600: fmt(TARGET_LIGHTNESS[600]),
    700: fmt(TARGET_LIGHTNESS[700]),
    800: fmt(TARGET_LIGHTNESS[800]),
    900: fmt(TARGET_LIGHTNESS[900]),
    950: fmt(TARGET_LIGHTNESS[950]),
  }
}
