/**
 * Color tokens — single source of truth for all OKLCH values used across the
 * theme system. Every preset, base color, theme color, and chart color
 * references entries from this file. No OKLCH literal should appear anywhere
 * else in `src/theme/`.
 *
 * Each color is an 11-step ramp from 50 (lightest) to 950 (darkest), in OKLCH.
 * Step semantics (loose convention, mirrors Tailwind):
 *   50–200  page/card backgrounds, hover tints
 *   300–400 borders, muted foregrounds, disabled states
 *   500     mid-tone, often used for accents in light mode
 *   600     primary in light mode (default button bg)
 *   700–800 hover/pressed primary, dark-mode foregrounds
 *   900–950 deep ink, dark-mode card/page backgrounds
 *
 * Bases (neutral, stone, zinc, mauve, olive, mist, taupe) carry the page's
 * neutral palette. Hues (amber..yellow) are picked by the Theme/Chart pickers.
 * `terracotta` is private — it powers the Vega (Pilotiq brand) preset and is
 * deliberately excluded from `ThemeColor` / `ChartColor` unions.
 */

export type ColorStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950

export type ColorScale = Record<ColorStep, string>

// ─── Base color scales (neutrals) ──────────────────────────────────────

const neutral: ColorScale = {
  50:  'oklch(0.985 0 0)',
  100: 'oklch(0.97 0 0)',
  200: 'oklch(0.922 0 0)',
  300: 'oklch(0.87 0 0)',
  400: 'oklch(0.708 0 0)',
  500: 'oklch(0.556 0 0)',
  600: 'oklch(0.439 0 0)',
  700: 'oklch(0.371 0 0)',
  800: 'oklch(0.269 0 0)',
  900: 'oklch(0.205 0 0)',
  950: 'oklch(0.145 0 0)',
}

const stone: ColorScale = {
  50:  'oklch(0.985 0.001 75)',
  100: 'oklch(0.97 0.001 75)',
  200: 'oklch(0.923 0.003 75)',
  300: 'oklch(0.869 0.005 75)',
  400: 'oklch(0.709 0.01 75)',
  500: 'oklch(0.553 0.013 75)',
  600: 'oklch(0.444 0.011 75)',
  700: 'oklch(0.374 0.01 75)',
  800: 'oklch(0.268 0.007 75)',
  900: 'oklch(0.216 0.006 75)',
  950: 'oklch(0.147 0.004 75)',
}

const zinc: ColorScale = {
  50:  'oklch(0.985 0 0)',
  100: 'oklch(0.967 0.001 286)',
  200: 'oklch(0.92 0.004 286)',
  300: 'oklch(0.871 0.006 286)',
  400: 'oklch(0.705 0.015 286)',
  500: 'oklch(0.552 0.016 286)',
  600: 'oklch(0.442 0.017 286)',
  700: 'oklch(0.37 0.013 286)',
  800: 'oklch(0.274 0.006 286)',
  900: 'oklch(0.21 0.006 286)',
  950: 'oklch(0.141 0.005 286)',
}

// Warm pinkish-gray (hue ~340)
const mauve: ColorScale = {
  50:  'oklch(0.99 0.003 340)',
  100: 'oklch(0.97 0.005 340)',
  200: 'oklch(0.92 0.008 340)',
  300: 'oklch(0.87 0.012 340)',
  400: 'oklch(0.71 0.018 340)',
  500: 'oklch(0.555 0.02 340)',
  600: 'oklch(0.44 0.018 340)',
  700: 'oklch(0.37 0.015 340)',
  800: 'oklch(0.275 0.012 340)',
  900: 'oklch(0.21 0.01 340)',
  950: 'oklch(0.145 0.008 340)',
}

// Earthy green-gray (hue ~120)
const olive: ColorScale = {
  50:  'oklch(0.99 0.003 120)',
  100: 'oklch(0.965 0.006 120)',
  200: 'oklch(0.91 0.008 120)',
  300: 'oklch(0.86 0.01 120)',
  400: 'oklch(0.7 0.014 120)',
  500: 'oklch(0.55 0.015 120)',
  600: 'oklch(0.43 0.013 120)',
  700: 'oklch(0.37 0.012 120)',
  800: 'oklch(0.275 0.012 120)',
  900: 'oklch(0.21 0.012 120)',
  950: 'oklch(0.15 0.012 120)',
}

// Cool blue-gray (hue ~240) — replaces the old `slate`
const mist: ColorScale = {
  50:  'oklch(0.99 0.003 240)',
  100: 'oklch(0.97 0.005 240)',
  200: 'oklch(0.92 0.008 240)',
  300: 'oklch(0.87 0.012 240)',
  400: 'oklch(0.71 0.018 240)',
  500: 'oklch(0.555 0.022 240)',
  600: 'oklch(0.44 0.02 240)',
  700: 'oklch(0.37 0.018 240)',
  800: 'oklch(0.275 0.014 240)',
  900: 'oklch(0.21 0.012 240)',
  950: 'oklch(0.145 0.01 240)',
}

// Warm neutral brown (hue ~50)
const taupe: ColorScale = {
  50:  'oklch(0.99 0.002 50)',
  100: 'oklch(0.965 0.004 50)',
  200: 'oklch(0.91 0.005 50)',
  300: 'oklch(0.86 0.008 50)',
  400: 'oklch(0.7 0.012 50)',
  500: 'oklch(0.55 0.013 50)',
  600: 'oklch(0.43 0.012 50)',
  700: 'oklch(0.37 0.01 50)',
  800: 'oklch(0.275 0.008 50)',
  900: 'oklch(0.21 0.008 50)',
  950: 'oklch(0.15 0.008 50)',
}

// ─── Hue scales (theme/chart colors) ───────────────────────────────────

const amber: ColorScale = {
  50:  'oklch(0.987 0.022 95)',
  100: 'oklch(0.962 0.059 95)',
  200: 'oklch(0.924 0.12 95)',
  300: 'oklch(0.879 0.169 91)',
  400: 'oklch(0.828 0.189 84)',
  500: 'oklch(0.769 0.188 70)',
  600: 'oklch(0.666 0.179 58)',
  700: 'oklch(0.555 0.163 49)',
  800: 'oklch(0.473 0.137 46)',
  900: 'oklch(0.414 0.112 45)',
  950: 'oklch(0.279 0.077 46)',
}

const blue: ColorScale = {
  50:  'oklch(0.97 0.014 254)',
  100: 'oklch(0.932 0.032 256)',
  200: 'oklch(0.882 0.059 254)',
  300: 'oklch(0.809 0.105 251)',
  400: 'oklch(0.707 0.165 254)',
  500: 'oklch(0.623 0.214 259)',
  600: 'oklch(0.546 0.245 262)',
  700: 'oklch(0.488 0.243 264)',
  800: 'oklch(0.424 0.199 265)',
  900: 'oklch(0.379 0.146 265)',
  950: 'oklch(0.282 0.091 267)',
}

const cyan: ColorScale = {
  50:  'oklch(0.984 0.019 200)',
  100: 'oklch(0.953 0.05 196)',
  200: 'oklch(0.917 0.08 205)',
  300: 'oklch(0.865 0.127 207)',
  400: 'oklch(0.789 0.154 211)',
  500: 'oklch(0.715 0.143 215)',
  600: 'oklch(0.609 0.126 221)',
  700: 'oklch(0.52 0.105 223)',
  800: 'oklch(0.45 0.085 224)',
  900: 'oklch(0.398 0.07 227)',
  950: 'oklch(0.302 0.056 230)',
}

const emerald: ColorScale = {
  50:  'oklch(0.979 0.021 166)',
  100: 'oklch(0.95 0.052 163)',
  200: 'oklch(0.905 0.093 164)',
  300: 'oklch(0.845 0.143 164)',
  400: 'oklch(0.765 0.177 163)',
  500: 'oklch(0.696 0.17 162)',
  600: 'oklch(0.596 0.145 163)',
  700: 'oklch(0.508 0.118 165)',
  800: 'oklch(0.432 0.095 166)',
  900: 'oklch(0.378 0.077 168)',
  950: 'oklch(0.262 0.051 172)',
}

const fuchsia: ColorScale = {
  50:  'oklch(0.977 0.017 320)',
  100: 'oklch(0.952 0.037 318)',
  200: 'oklch(0.903 0.076 319)',
  300: 'oklch(0.833 0.145 321)',
  400: 'oklch(0.74 0.238 322)',
  500: 'oklch(0.667 0.295 322)',
  600: 'oklch(0.591 0.293 322)',
  700: 'oklch(0.518 0.253 323)',
  800: 'oklch(0.452 0.211 324)',
  900: 'oklch(0.401 0.17 325)',
  950: 'oklch(0.293 0.136 325)',
}

const green: ColorScale = {
  50:  'oklch(0.982 0.018 155)',
  100: 'oklch(0.962 0.044 156)',
  200: 'oklch(0.925 0.084 156)',
  300: 'oklch(0.871 0.15 154)',
  400: 'oklch(0.792 0.209 151)',
  500: 'oklch(0.723 0.219 150)',
  600: 'oklch(0.627 0.194 149)',
  700: 'oklch(0.527 0.154 150)',
  800: 'oklch(0.448 0.119 151)',
  900: 'oklch(0.393 0.095 152)',
  950: 'oklch(0.266 0.065 152)',
}

const indigo: ColorScale = {
  50:  'oklch(0.962 0.018 273)',
  100: 'oklch(0.93 0.034 272)',
  200: 'oklch(0.87 0.065 274)',
  300: 'oklch(0.785 0.115 274)',
  400: 'oklch(0.673 0.182 276)',
  500: 'oklch(0.585 0.233 277)',
  600: 'oklch(0.511 0.262 276)',
  700: 'oklch(0.457 0.24 277)',
  800: 'oklch(0.398 0.195 277)',
  900: 'oklch(0.359 0.144 278)',
  950: 'oklch(0.257 0.09 281)',
}

const lime: ColorScale = {
  50:  'oklch(0.986 0.031 120)',
  100: 'oklch(0.967 0.067 122)',
  200: 'oklch(0.938 0.127 124)',
  300: 'oklch(0.897 0.196 126)',
  400: 'oklch(0.841 0.238 128)',
  500: 'oklch(0.768 0.233 130)',
  600: 'oklch(0.648 0.2 132)',
  700: 'oklch(0.532 0.157 132)',
  800: 'oklch(0.453 0.124 130)',
  900: 'oklch(0.405 0.101 131)',
  950: 'oklch(0.274 0.072 132)',
}

const orange: ColorScale = {
  50:  'oklch(0.98 0.016 73)',
  100: 'oklch(0.954 0.038 75)',
  200: 'oklch(0.901 0.076 70)',
  300: 'oklch(0.837 0.128 66)',
  400: 'oklch(0.75 0.183 55)',
  500: 'oklch(0.705 0.213 47)',
  600: 'oklch(0.646 0.222 41)',
  700: 'oklch(0.553 0.195 38)',
  800: 'oklch(0.47 0.157 37)',
  900: 'oklch(0.408 0.123 38)',
  950: 'oklch(0.266 0.079 36)',
}

const pink: ColorScale = {
  50:  'oklch(0.971 0.014 343)',
  100: 'oklch(0.948 0.028 342)',
  200: 'oklch(0.899 0.061 343)',
  300: 'oklch(0.823 0.12 346)',
  400: 'oklch(0.718 0.202 349)',
  500: 'oklch(0.656 0.241 354)',
  600: 'oklch(0.592 0.249 0)',
  700: 'oklch(0.525 0.223 3)',
  800: 'oklch(0.459 0.187 3)',
  900: 'oklch(0.408 0.153 2)',
  950: 'oklch(0.284 0.109 3)',
}

const purple: ColorScale = {
  50:  'oklch(0.977 0.014 308)',
  100: 'oklch(0.946 0.033 307)',
  200: 'oklch(0.902 0.063 306)',
  300: 'oklch(0.827 0.119 306)',
  400: 'oklch(0.714 0.203 305)',
  500: 'oklch(0.627 0.265 304)',
  600: 'oklch(0.558 0.288 302)',
  700: 'oklch(0.496 0.265 301)',
  800: 'oklch(0.438 0.218 303)',
  900: 'oklch(0.381 0.176 304)',
  950: 'oklch(0.291 0.149 302)',
}

const red: ColorScale = {
  50:  'oklch(0.971 0.013 17)',
  100: 'oklch(0.936 0.032 17)',
  200: 'oklch(0.885 0.062 18)',
  300: 'oklch(0.808 0.114 19)',
  400: 'oklch(0.704 0.191 22)',
  500: 'oklch(0.637 0.237 25)',
  600: 'oklch(0.577 0.245 27)',
  700: 'oklch(0.505 0.213 27)',
  800: 'oklch(0.444 0.177 26)',
  900: 'oklch(0.396 0.141 25)',
  950: 'oklch(0.258 0.092 26)',
}

const rose: ColorScale = {
  50:  'oklch(0.969 0.015 12)',
  100: 'oklch(0.941 0.03 12)',
  200: 'oklch(0.892 0.058 10)',
  300: 'oklch(0.81 0.117 11)',
  400: 'oklch(0.712 0.194 13)',
  500: 'oklch(0.645 0.246 16)',
  600: 'oklch(0.586 0.253 17)',
  700: 'oklch(0.514 0.222 16)',
  800: 'oklch(0.455 0.188 13)',
  900: 'oklch(0.41 0.159 10)',
  950: 'oklch(0.271 0.105 12)',
}

const sky: ColorScale = {
  50:  'oklch(0.977 0.013 236)',
  100: 'oklch(0.951 0.026 236)',
  200: 'oklch(0.901 0.058 230)',
  300: 'oklch(0.828 0.111 230)',
  400: 'oklch(0.746 0.16 232)',
  500: 'oklch(0.685 0.169 237)',
  600: 'oklch(0.588 0.158 241)',
  700: 'oklch(0.5 0.134 242)',
  800: 'oklch(0.443 0.11 240)',
  900: 'oklch(0.391 0.09 240)',
  950: 'oklch(0.293 0.066 243)',
}

const teal: ColorScale = {
  50:  'oklch(0.984 0.014 180)',
  100: 'oklch(0.953 0.051 180)',
  200: 'oklch(0.91 0.096 180)',
  300: 'oklch(0.855 0.138 181)',
  400: 'oklch(0.777 0.152 181)',
  500: 'oklch(0.704 0.14 182)',
  600: 'oklch(0.6 0.118 184)',
  700: 'oklch(0.511 0.096 186)',
  800: 'oklch(0.437 0.078 188)',
  900: 'oklch(0.386 0.063 188)',
  950: 'oklch(0.277 0.046 192)',
}

const violet: ColorScale = {
  50:  'oklch(0.969 0.016 293)',
  100: 'oklch(0.943 0.029 294)',
  200: 'oklch(0.894 0.057 293)',
  300: 'oklch(0.811 0.111 293)',
  400: 'oklch(0.702 0.183 293)',
  500: 'oklch(0.606 0.25 292)',
  600: 'oklch(0.541 0.281 293)',
  700: 'oklch(0.491 0.27 292)',
  800: 'oklch(0.432 0.232 292)',
  900: 'oklch(0.381 0.176 304)',
  950: 'oklch(0.283 0.141 291)',
}

const yellow: ColorScale = {
  50:  'oklch(0.987 0.026 102)',
  100: 'oklch(0.973 0.071 103)',
  200: 'oklch(0.945 0.129 101)',
  300: 'oklch(0.905 0.182 98)',
  400: 'oklch(0.852 0.199 91)',
  500: 'oklch(0.795 0.184 86)',
  600: 'oklch(0.681 0.162 75)',
  700: 'oklch(0.554 0.135 66)',
  800: 'oklch(0.476 0.114 62)',
  900: 'oklch(0.421 0.095 58)',
  950: 'oklch(0.286 0.066 53)',
}

// Pilotiq brand — anchors the Vega preset and is also exposed as a regular
// hue in the Theme/Chart pickers so users can pick the brand color directly.
const terracotta: ColorScale = {
  50:  'oklch(0.979 0.008 78)',
  100: 'oklch(0.955 0.025 60)',
  200: 'oklch(0.91 0.05 50)',
  300: 'oklch(0.85 0.075 47)',
  400: 'oklch(0.78 0.105 45)',
  500: 'oklch(0.685 0.126 43)',
  600: 'oklch(0.575 0.145 38)',
  700: 'oklch(0.475 0.155 33)',
  800: 'oklch(0.395 0.165 30)',
  900: 'oklch(0.365 0.173 28)',
  950: 'oklch(0.25 0.13 28)',
}

// Deep-red companion to `terracotta`. Mirrors the marketing-site token
// `--color-pilotiq-crimson-dark` (`#8f0005`) — reserved for high-emphasis
// hover/pressed states on the brand crimson. Not wired into any preset yet;
// available as `colors.crimsonDark[X]` if a future component needs it.
const crimsonDark: ColorScale = {
  50:  'oklch(0.971 0.013 25)',
  100: 'oklch(0.93 0.04 25)',
  200: 'oklch(0.86 0.085 25)',
  300: 'oklch(0.77 0.135 25)',
  400: 'oklch(0.66 0.18 25)',
  500: 'oklch(0.55 0.21 25)',
  600: 'oklch(0.48 0.21 25)',
  700: 'oklch(0.43 0.2 25)',
  800: 'oklch(0.408 0.193 25)', // ← `#8f0005` — primary use
  900: 'oklch(0.35 0.165 25)',
  950: 'oklch(0.26 0.12 25)',
}

// ─── Export ────────────────────────────────────────────────────────────

export const colors = {
  // bases
  neutral,
  stone,
  zinc,
  mauve,
  olive,
  mist,
  taupe,
  // hues
  amber,
  blue,
  cyan,
  emerald,
  fuchsia,
  green,
  indigo,
  lime,
  orange,
  pink,
  purple,
  red,
  rose,
  sky,
  teal,
  terracotta,
  violet,
  yellow,
  // private
  crimsonDark,
} as const

export type ColorName = keyof typeof colors

/** Subset of color names that are valid as a base color in the picker. */
export const BASE_COLOR_NAMES = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'] as const

/** Subset of color names that are valid as a theme/chart hue (excludes neutrals + private). */
export const HUE_NAMES = [
  'amber', 'blue', 'cyan', 'emerald', 'fuchsia', 'green', 'indigo', 'lime',
  'orange', 'pink', 'purple', 'red', 'rose', 'sky', 'teal', 'terracotta', 'violet', 'yellow',
] as const
