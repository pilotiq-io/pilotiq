# Theme Editor — shadcn/ui/create redesign

Reshape `@pilotiq/pilotiq` theme editor to mirror `https://ui.shadcn.com/create`: pick a Style → Base color → Theme color → Chart color, with live preview.

## Status

Planned — not started.

## Goals

- 4 ordered pickers in the editor: **Style**, **Base color**, **Theme color**, **Chart color**.
- "Same as base color" sentinel for both Theme and Chart so a user can pick a Base and ship.
- Preserve the Pilotiq brand (terracotta/cream/Satoshi) by folding it into one of the 7 named styles.
- **Single source of truth for color tokens** — eliminate OKLCH literal duplication across `presets.ts`, accent/theme colors, chart colors, base colors. Mirror shadcn's per-color-scale approach.

## Scope

Only `packages/pilotiq/`. No changes to `packages/panels`, `packages/lexical`, `packages/media`, or any playground source. `playground-pilotiq` is used for manual sanity-check only (Phase 4) — no edits.

## Color token single source of truth

Add `packages/pilotiq/src/theme/colors.ts`:

```ts
// 50..950 OKLCH ramps. Lightness/chroma values consistent across hues.
export const colors = {
  // neutrals (used by base-colors)
  neutral: { 50: 'oklch(...)', 100: '...', ..., 950: '...' },
  stone:   { ... },
  zinc:    { ... },
  mauve:   { ... },   // new — hue ~340
  olive:   { ... },
  mist:    { ... },   // new — hue ~240, replaces slate
  taupe:   { ... },

  // named hues (used by theme-colors + chart-colors)
  amber:   { ... },
  blue:    { ... },
  cyan:    { ... },
  emerald: { ... },
  fuchsia: { ... },
  green:   { ... },
  indigo:  { ... },
  lime:    { ... },
  orange:  { ... },
  pink:    { ... },
  purple:  { ... },
  red:     { ... },
  rose:    { ... },
  sky:     { ... },
  teal:    { ... },
  violet:  { ... },
  yellow:  { ... },
} as const

export type ColorName = keyof typeof colors
export type ColorStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950
```

Downstream files reference `colors.<name>[<step>]` instead of inline OKLCH:

- `base-colors.ts` — neutral builder maps each base to the right scale: `bg = colors[base][50]`, `border = colors[base][200]`, etc. (One small builder fn, 7 base colors built from the same recipe.)
- `theme-colors.ts` — `primary (light) = colors[name][600]`, `primary (dark) = colors[name][400]`, `ring (light) = colors[name][600]`. One builder fn replaces the 17 hand-written `accent(...)` calls.
- `chart-colors.ts` — single-hue ramp: `[colors[name][700], 600, 500, 400, 300]` for light, mirrored for dark.
- `presets.ts` — `vega` references `colors.orange[*]` for terracotta-ish brand and `colors.taupe[*]` for cream-ish neutrals (or a brand-specific scale `colors.terracotta` if we keep it as a non-pickable token).

Effect:
- Adding a new color = one entry in `colors.ts`.
- Tuning blue's lightness = one line, applies to theme-color picker, chart-color picker, and any preset that references blue.
- `base` sentinel for theme-color collapses to `colors[selectedBase][600]` — no per-base lookup table needed.
- Chart single-hue ramp is generated, not hand-tuned.

### Should `colors.terracotta` exist?

Open question. The pilotiq brand currently uses `oklch(0.685 0.126 43)`. If we add `terracotta` as a full 50..950 scale in `colors.ts` we keep symmetry but it never appears in the picker (it'd be the only "private" color). Two options:

- **A)** Add `terracotta` scale to `colors.ts` but exclude from `ThemeColor` / `ChartColor` unions. Vega preset references it. Symmetric and clean.
- **B)** Keep terracotta inline in `presets.ts` only, treat vega as "the one preset with non-token literals." Asymmetric but smaller surface.

Lean **A** — pays for itself the moment we want to expose terracotta in any future picker.

## Decisions

- **Style picker**: 7 named presets — `vega`, `nova`, `maia`, `lyra`, `mira`, `luma`, `sera`.
  - `vega` = Pilotiq brand (terracotta, cream, Satoshi, medium radius). Default fallback when no preset is set.
  - `nova` / `maia` / `lyra` / `mira` / `luma` / `sera` = placeholder CSS (all identical to the shadcn neutral tokens user pasted). Real differentiation deferred to a follow-up; each will get its own character (radius, fonts, token relationships).
- **Base color**: 7 options — `neutral`, `stone`, `zinc`, `mauve`, `olive`, `mist`, `taupe`. No `default` sentinel; base is always concrete. Drops `slate` and `cream`; adds `mauve` (warm pinkish-gray ~340) and `mist` (cool blue-gray ~240).
- **Theme color** (renamed from accent): 18 options — `base` sentinel + 17 named hues. Drops `terracotta` (lives in vega preset now); adds `yellow`. Default = `base`.
- **Chart color** (replaces chart palette): 18 options — `base` sentinel + 17 named hues. Each named hue generates a 5-step single-hue ramp for `--chart-1..5`. Default = `base`.

## Data model changes

`packages/pilotiq/src/theme/types.ts`:

```ts
export type StylePreset = 'vega' | 'nova' | 'maia' | 'lyra' | 'mira' | 'luma' | 'sera'
export type BaseColor   = 'neutral' | 'stone' | 'zinc' | 'mauve' | 'olive' | 'mist' | 'taupe'
export type ThemeColor  = 'base' | 'amber' | 'blue' | 'cyan' | 'emerald' | 'fuchsia'
                        | 'green' | 'indigo' | 'lime' | 'orange' | 'pink' | 'purple'
                        | 'red' | 'rose' | 'sky' | 'teal' | 'violet' | 'yellow'
export type ChartColor  = ThemeColor // identical shape

export interface ThemeConfig {
  preset?:      StylePreset
  baseColor?:   BaseColor
  themeColor?:  ThemeColor   // was: accentColor
  chartColor?:  ChartColor   // was: chartPalette
  radius?:      RadiusPreset
  fonts?:       ThemeFonts
  iconLibrary?: IconLibrary
  cssVariables?: { light?: Record<string,string>; dark?: Record<string,string> }
}
```

## File-by-file changes

### Theme module (`packages/pilotiq/src/theme/`)

- `types.ts` — update unions per above.
- `presets.ts` — define 7 presets. `vega` = current `defaultPreset`. `nova/maia/lyra/mira/luma/sera` = identical placeholder copies of the shadcn neutral CSS. Drop the existing `nova/maia/lyra` body content (those names are reused but content reset).
- `base-colors.ts` — drop `slate`, `cream`, `defaultBase`. Add `mauve` and `mist` PresetDefinitions.
- `accent-colors.ts` → rename to `theme-colors.ts`. Drop `terracotta`. Add `yellow`. Add `base` resolver: per-base lookup of `{ primary, primary-fg, ring, sidebar-primary, sidebar-primary-fg, sidebar-ring }` (one row per base color).
- `chart-palettes.ts` → rename to `chart-colors.ts`. Replace `ocean/sunset/forest/berry/terracotta` with one entry per ThemeColor. Each entry's chart-1..5 = lightness ramp at fixed hue/chroma derived from the same OKLCH that primary uses. `base` entry = per-base ramp lookup (mirrors theme-color `base`).
- `resolve.ts` — update layering steps to use `themeColor` and `chartColor`. Resolve `base` sentinels via base-color → primary/ramp lookup tables. Default fallback: `preset='vega'`, `themeColor='base'`, `chartColor='base'`.
- `index.ts` — update exports.

### Builder (`packages/pilotiq/src/Pilotiq.ts`)

- `.theme()` accepts `themeColor`/`chartColor` (rename from `accentColor`/`chartPalette`). Add deprecated aliases for one release that warn + map.

### Editor UI (`packages/pilotiq/src/react/ThemeSettingsPage.tsx`)

Dropdown-based sidebar matching the shadcn/ui/create reference design (not swatch grids). Each control is a labeled `Select` with a leading visual indicator:

| Order | Control      | Indicator                                  | Options                                       |
|-------|--------------|--------------------------------------------|-----------------------------------------------|
| 1     | Style        | square glyph                               | vega, nova, maia, lyra, mira, luma, sera      |
| 2     | Base Color   | filled dot in base's neutral tone          | neutral, stone, zinc, mauve, olive, mist, taupe |
| 3     | Theme        | filled dot in selected hue (or base hue)   | base + 17 hues (see dropdown structure below) |
| 4     | Chart Color  | filled dot in selected hue (or base hue)   | base + 17 hues (see dropdown structure below) |

**Theme + Chart dropdown structure:**

- Top row (pinned, separator below) = the `base` sentinel, **labeled with the current base color's name** — e.g. when `baseColor: 'taupe'`, the row reads "Taupe". Selecting it stores `themeColor: 'base'`.
- Alphabetical list of the 17 named hues follows.
- Checkmark sits next to whichever option is currently selected (the top sentinel row when `themeColor === 'base'`, or the matching hue otherwise).
- The trigger button label uses the same dynamic resolution — "Theme: Taupe" when sentinel is selected, "Theme: Fuchsia" when a hue is selected.
| 5     | Heading      | `Aa` glyph                                 | font picker                                   |
| 6     | Font         | `Aa` glyph                                 | font picker                                   |
| 7     | Icon Library | spiral/library glyph                       | lucide, tabler, remix, phosphor               |
| 8     | Radius       | rounded-corner glyph                       | none, small, default, medium, large           |

Live iframe preview unchanged. Sidebar styled dark (matches reference). Bottom of sidebar gets Open Preset / Shuffle / preset-hash later (out of scope this phase).

### shadcn components to add to `packages/pilotiq/src/react/ui/`

Install in playground first, then port into the package:

```bash
cd playground-pilotiq
pnpm dlx shadcn@latest add select label popover
```

Then copy `playground-pilotiq/src/components/ui/{select,label,popover}.tsx` into `packages/pilotiq/src/react/ui/`, fixing import paths (`@/lib/utils` → `../utils.js`, `.js` extensions everywhere) per package convention.

`popover` is for the Level 1 custom-color picker (see "Custom colors" below). If we defer custom colors, drop popover.

### API (`packages/pilotiq/src/routes.ts` + theme editor plugin)

- GET/PUT `/api/_theme` payload schema: `{ preset, baseColor, themeColor, chartColor, radius, fonts, iconLibrary, cssVariables }`. Validate against unions.

## Persistence migration

DB rows on `panelGlobal` may carry old shape. Read-side shim in service provider boot, no destructive write:

| Old field          | Old value         | New value                              |
|--------------------|-------------------|----------------------------------------|
| `preset`           | `default`         | `vega`                                 |
| `baseColor`        | `slate`           | `mist`                                 |
| `baseColor`        | `cream`           | drop (vega's preset bg supplies it)    |
| `accentColor`      | `terracotta`      | `themeColor: 'base'` (when preset=vega), else `'orange'` |
| `accentColor`      | any other         | `themeColor: <same name>`              |
| `chartPalette`     | `ocean`           | `chartColor: 'sky'`                    |
| `chartPalette`     | `sunset`          | `chartColor: 'orange'`                 |
| `chartPalette`     | `forest`          | `chartColor: 'emerald'`                |
| `chartPalette`     | `berry`           | `chartColor: 'fuchsia'`                |
| `chartPalette`     | `terracotta`      | `chartColor: 'base'`                   |
| `chartPalette`     | `default`         | `chartColor: 'base'`                   |

When the editor next saves, the new shape lands and the shim becomes a no-op for that row.

## Phases

1. **Color tokens** — add `colors.ts` single source of truth with all scales. Type exports `ColorName`, `ColorStep`. Pure data, no consumers yet.
2. **Refactor existing consumers to use tokens** — port `base-colors.ts`, `accent-colors.ts`, `chart-palettes.ts`, `presets.ts` to reference `colors.*` (no behavior change yet, just dedup). Typecheck.
3. **Type model rename + new options** — `accentColor`→`themeColor`, `chartPalette`→`chartColor`, add `mauve`/`mist`/`yellow`, drop `slate`/`cream`/`terracotta`/old chart palettes. Add `base` sentinel handling in `resolve.ts`.
4. **Builder + API** — `.theme()` field rename + deprecated aliases. `/api/_theme` schema update. Migration shim.
5. **shadcn components** — install `select`, `label`, `popover` in playground-pilotiq, copy into `packages/pilotiq/src/react/ui/` with import path fixes.
6. **Editor UI** — `ThemeSettingsPage.tsx` redesign as dark dropdown sidebar matching the reference. Add custom-color popover for Theme + Chart.
7. **Playground sanity check** — boot `playground-pilotiq`, confirm dropdowns swap correctly + saved overrides round-trip.
8. **Style refinement (separate PR)** — give each of `nova/maia/lyra/mira/luma/sera` a real character (radius, fonts, token relationships). Out of scope for this plan.

## Custom colors (Level 1, in scope)

`themeColor` and `chartColor` accept either a `ColorName` or an arbitrary hex/oklch seed:

```ts
.theme({ themeColor: '#c0ffee' })
.theme({ themeColor: 'oklch(0.7 0.15 200)' })
```

Type: `ThemeColor = ColorName | (string & {})`. Resolver: known name → table lookup; arbitrary string → parse via `culori` (or hand-rolled OKLCH parser if we want zero deps), generate 50…950 ramp by holding hue+chroma constant and varying lightness on the same curve as named scales. Single util `generateScale(seed: string): Record<ColorStep, string>`.

Editor UI: append a "Custom…" entry at the bottom of the Theme + Chart Color dropdowns. Selecting it opens a `Popover` with a hex input + live preview swatch. Saved value persists as the raw seed string in DB.

Caveats: auto-generated scales for extreme hues (e.g., yellow at L=0.95) can look chalky. The `cssVariables` raw escape hatch remains as the surgical override for that case. Level 2 (`extendColors` with full user-supplied scale) is deferred.

## Out of UI scope this phase

Bottom sidebar features from the reference design — defer to a follow-up:
- Preset hash / shareable link (`--preset blkeymG`)
- Open Preset (load saved preset by hash)
- Shuffle (randomize all selections)
- Create Project (export as code)

## Open questions (parked)

- Each of the 6 placeholder styles needs a real personality. To be addressed in Phase 7 separately.
- Should we expose `cssVariables` raw escape hatch in the editor UI? Currently code-only. Leave as-is.

## Out of scope

- Changing `RadiusPreset` or `IconLibrary` enums.
- Per-style font defaults (folded into Phase 5).
- New `panelGlobal` column or migration script — read-side shim is enough.
