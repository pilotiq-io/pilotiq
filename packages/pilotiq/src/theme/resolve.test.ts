import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolveTheme } from './resolve.js'
import { baseColors } from './base-colors.js'
import { colors } from './colors.js'
import { PRESET_FONTS, PRESET_RADIUS, PRESET_SPACING } from './presets.js'
import { radiusMap } from './radius.js'
import { spacingMap } from './spacing.js'

describe('resolveTheme', () => {
  // ─── Preset layering ─────────────────────────────────────

  describe('preset', () => {
    it('defaults to vega when not specified', () => {
      const empty = resolveTheme({})
      const explicit = resolveTheme({ preset: 'vega' })
      assert.deepEqual(empty.light, explicit.light)
      assert.deepEqual(empty.dark, explicit.dark)
    })

    it('falls back to vega for unknown preset values (defensive)', () => {
      // Cast to bypass type — defensive code in resolve.ts handles bad input
      // from deserialized DB rows.
      const bogus = resolveTheme({ preset: 'definitely-not-a-preset' as never })
      const vega  = resolveTheme({ preset: 'vega' })
      assert.deepEqual(bogus.light, vega.light)
    })
  })

  // ─── Base color defaulting (the recent regression) ───────

  describe('base color', () => {
    it('default state matches explicit baseColor: neutral', () => {
      // Regression guard: previously, empty config skipped the baseColor
      // overlay entirely, leaving the preset's hardcoded WHITE surfaces.
      // Picking "Neutral" applied neutral[50] surfaces. The two paths
      // produced different output — this asserts they now agree.
      const fromDefault  = resolveTheme({})
      const fromExplicit = resolveTheme({ baseColor: 'neutral' })
      assert.deepEqual(fromDefault.light, fromExplicit.light)
      assert.deepEqual(fromDefault.dark,  fromExplicit.dark)
    })

    it('applies stone tokens when baseColor: stone', () => {
      const stone = resolveTheme({ baseColor: 'stone' })
      // baseColors.stone uses stone[50] for --background (light mode).
      assert.equal(stone.light['--background'], baseColors.stone.light['--background'])
      // And stone[800] for --muted (dark mode).
      assert.equal(stone.dark['--muted'], baseColors.stone.dark['--muted'])
    })

    it('does not leak stone tokens when baseColor is neutral', () => {
      const neutral = resolveTheme({ baseColor: 'neutral' })
      assert.notEqual(neutral.light['--background'], baseColors.stone.light['--background'])
    })
  })

  // ─── Theme color resolution ──────────────────────────────

  describe('theme color', () => {
    it("'base' sentinel uses the resolved base color scale", () => {
      // With baseColor: 'stone' and themeColor: 'base', --primary should be
      // stone[900] in light (the strongest in-scale contrast). The 'base'
      // path uses isBase=true, which picks scale[900] for light --primary.
      const stoneBase = resolveTheme({ baseColor: 'stone', themeColor: 'base' })
      assert.equal(stoneBase.light['--primary'], colors.stone[900])
      assert.equal(stoneBase.dark['--primary'],  colors.stone[50])
    })

    it("'base' sentinel falls back to neutral when no baseColor set", () => {
      const fallback = resolveTheme({ themeColor: 'base' })
      assert.equal(fallback.light['--primary'], colors.neutral[900])
    })

    it('hue values override --primary with that hue', () => {
      const blue = resolveTheme({ themeColor: 'blue' })
      // Non-base hue uses scale[600] in BOTH light and dark for brand
      // consistency across modes.
      assert.equal(blue.light['--primary'], colors.blue[600])
      assert.equal(blue.dark['--primary'],  colors.blue[600])
    })

    it('defaults to base sentinel when not specified', () => {
      const noTheme = resolveTheme({ baseColor: 'stone' })
      const explicitBase = resolveTheme({ baseColor: 'stone', themeColor: 'base' })
      assert.equal(noTheme.light['--primary'], explicitBase.light['--primary'])
    })
  })

  // ─── Chart color resolution ──────────────────────────────

  describe('chart color', () => {
    it("'base' sentinel uses the resolved base color scale for --chart-1..5", () => {
      const stoneChart = resolveTheme({ baseColor: 'stone', chartColor: 'base' })
      // All five chart vars should be defined and pull from the stone scale.
      for (const i of [1, 2, 3, 4, 5]) {
        const value = stoneChart.light[`--chart-${i}`]
        assert.ok(value, `--chart-${i} should be set`)
        // Chart vars derived from a single-hue ramp should appear in the
        // stone scale's value set.
        const stoneValues = Object.values(colors.stone)
        assert.ok(stoneValues.includes(value!), `--chart-${i} (${value}) should come from the stone scale`)
      }
    })

    it('hue value overrides chart palette', () => {
      const a = resolveTheme({ chartColor: 'blue' })
      const b = resolveTheme({ chartColor: 'red' })
      assert.notEqual(a.light['--chart-1'], b.light['--chart-1'])
    })
  })

  // ─── Radius resolution ───────────────────────────────────

  describe('radius', () => {
    it("'default' falls through to PRESET_RADIUS[preset]", () => {
      // Maia's default radius is 'large' per PRESET_RADIUS.
      const maia = resolveTheme({ preset: 'maia', radius: 'default' })
      assert.equal(maia.radius, radiusMap[PRESET_RADIUS.maia])
      assert.equal(maia.radius, radiusMap.large)
    })

    it('undefined radius falls through to PRESET_RADIUS[preset]', () => {
      // Same path as 'default' — both resolve through PRESET_RADIUS.
      const luma = resolveTheme({ preset: 'luma' })
      assert.equal(luma.radius, radiusMap[PRESET_RADIUS.luma])
      assert.equal(luma.radius, radiusMap.xlarge)
    })

    it('explicit radius wins over preset default', () => {
      // Maia's preset radius is 'large', but explicit 'small' should win.
      const maia = resolveTheme({ preset: 'maia', radius: 'small' })
      assert.equal(maia.radius, radiusMap.small)
    })
  })

  // ─── Spacing resolution ──────────────────────────────────

  describe('spacing', () => {
    it("'default' falls through to PRESET_SPACING[preset]", () => {
      // Mira's default spacing is 'compact'.
      const mira = resolveTheme({ preset: 'mira', spacing: 'default' })
      assert.equal(mira.spacing, spacingMap[PRESET_SPACING.mira])
      assert.equal(mira.spacing, spacingMap.compact)
    })

    it('undefined spacing falls through to PRESET_SPACING[preset]', () => {
      const vega = resolveTheme({ preset: 'vega' })
      assert.equal(vega.spacing, spacingMap[PRESET_SPACING.vega])
      assert.equal(vega.spacing, spacingMap.default)
    })

    it('explicit spacing wins over preset default', () => {
      // Mira's preset spacing is 'compact', but explicit 'comfortable' wins.
      const mira = resolveTheme({ preset: 'mira', spacing: 'comfortable' })
      assert.equal(mira.spacing, spacingMap.comfortable)
    })
  })

  // ─── Font resolution ─────────────────────────────────────

  describe('fonts', () => {
    it('falls through to PRESET_FONTS[preset] when not set', () => {
      const sera = resolveTheme({ preset: 'sera' })
      assert.equal(sera.fonts?.heading, PRESET_FONTS.sera.heading)
      assert.equal(sera.fonts?.body,    PRESET_FONTS.sera.body)
      assert.equal(sera.fonts?.heading, 'Playfair Display')
      assert.equal(sera.fonts?.body,    'Noto Sans')
    })

    it('field-level fallback — body override does not drop heading default', () => {
      // Regression guard: if resolveTheme used object-level `??`, supplying
      // only `fonts.body` would drop the heading default. Field-level merge
      // keeps both pieces independently overridable.
      const sera = resolveTheme({ preset: 'sera', fonts: { body: 'Inter' } })
      assert.equal(sera.fonts?.body,    'Inter')
      assert.equal(sera.fonts?.heading, 'Playfair Display') // preset default
    })

    it('emits fontFamily with quoted-name fallback chain', () => {
      const vega = resolveTheme({ preset: 'vega' })
      assert.match(vega.fontFamily?.heading ?? '', /^'Inter', system-ui, sans-serif$/)
      assert.match(vega.fontFamily?.body ?? '',    /^'Inter', system-ui, sans-serif$/)
    })
  })

  // ─── cssVariables escape hatch ───────────────────────────

  describe('cssVariables override', () => {
    it('overrides preset, base, theme, and chart layers', () => {
      const result = resolveTheme({
        preset:    'vega',
        baseColor: 'stone',
        themeColor: 'blue',
        chartColor: 'red',
        cssVariables: {
          light: { '--primary': 'oklch(0.5 0.2 200)', '--background': 'rebeccapurple' },
          dark:  { '--primary': 'oklch(0.6 0.2 200)' },
        },
      })
      // Wins over themeColor (blue would have been set first).
      assert.equal(result.light['--primary'], 'oklch(0.5 0.2 200)')
      // Wins over baseColor stone's --background.
      assert.equal(result.light['--background'], 'rebeccapurple')
      // Dark override applied independently.
      assert.equal(result.dark['--primary'], 'oklch(0.6 0.2 200)')
    })

    it('does not leak light overrides into dark or vice versa', () => {
      const result = resolveTheme({
        cssVariables: { light: { '--custom': 'x' } },
      })
      assert.equal(result.light['--custom'], 'x')
      assert.equal(result.dark['--custom'],  undefined)
    })
  })

  // ─── Misc result shape ───────────────────────────────────

  describe('result shape', () => {
    it('defaults iconLibrary to lucide', () => {
      assert.equal(resolveTheme({}).iconLibrary, 'lucide')
    })

    it('respects iconLibrary when set', () => {
      assert.equal(resolveTheme({ iconLibrary: 'phosphor' }).iconLibrary, 'phosphor')
    })

    it('always emits radius and spacing as concrete CSS strings', () => {
      const r = resolveTheme({})
      assert.equal(typeof r.radius,  'string')
      assert.equal(typeof r.spacing, 'string')
      assert.match(r.radius,  /rem$|px$/)
      assert.match(r.spacing, /rem$/)
    })
  })
})
