import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parseSeedToScale } from './generate-scale.js'

describe('parseSeedToScale', () => {
  // ─── Hex parsing ─────────────────────────────────────────

  describe('hex input', () => {
    it('parses a valid 6-digit hex into an 11-step OKLCH scale', () => {
      const scale = parseSeedToScale('#3b82f6') // tailwind blue-500
      assert.ok(scale, 'scale should be returned')
      // All 11 steps present.
      for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const) {
        assert.match(scale[step], /^oklch\([\d.]+ [\d.]+ [\d.]+\)$/, `step ${step} should be a valid oklch() string`)
      }
    })

    it('accepts uppercase hex digits', () => {
      const a = parseSeedToScale('#3B82F6')
      const b = parseSeedToScale('#3b82f6')
      assert.deepEqual(a, b)
    })

    it('returns null for invalid hex', () => {
      assert.equal(parseSeedToScale('#zzzzzz'), null)
      assert.equal(parseSeedToScale('#12345'),  null) // wrong length
      assert.equal(parseSeedToScale('#1234567'), null)
    })

    it('returns null for hex without # prefix', () => {
      // Implementation gates hex parsing on a leading '#'.
      assert.equal(parseSeedToScale('3b82f6'), null)
    })

    it('preserves hue and chroma across all steps; only lightness varies', () => {
      const scale = parseSeedToScale('#3b82f6')
      assert.ok(scale)
      const steps = Object.values(scale)
      const parsed = steps.map(s => {
        const m = s.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)
        return m ? { L: +m[1]!, C: +m[2]!, H: +m[3]! } : null
      }).filter(Boolean) as { L: number; C: number; H: number }[]

      // Hue and chroma constant.
      const firstC = parsed[0]!.C
      const firstH = parsed[0]!.H
      for (const p of parsed) {
        assert.equal(p.C, firstC, 'chroma should be constant across steps')
        assert.equal(p.H, firstH, 'hue should be constant across steps')
      }
      // Lightness strictly decreases from step 50 → 950.
      for (let i = 1; i < parsed.length; i++) {
        assert.ok(parsed[i]!.L < parsed[i - 1]!.L, `step ${i} should be darker than ${i - 1}`)
      }
    })

    it('discards seed lightness (same hue/chroma → same scale regardless of L)', () => {
      // Two oklch seeds with identical hue + chroma but different lightness
      // should produce identical scales — only H and C contribute.
      const dark  = parseSeedToScale('oklch(0.3 0.15 240)')
      const light = parseSeedToScale('oklch(0.8 0.15 240)')
      assert.deepEqual(dark, light)
    })
  })

  // ─── oklch() parsing ─────────────────────────────────────

  describe('oklch() input', () => {
    it('parses a valid oklch() string', () => {
      const scale = parseSeedToScale('oklch(0.55 0.18 250)')
      assert.ok(scale)
      // Hue 250 should appear in every step's serialized string (rounded to .1).
      for (const v of Object.values(scale)) {
        assert.match(v, / 250\.0\)$/)
      }
    })

    it('is case-insensitive on the OKLCH prefix', () => {
      const upper = parseSeedToScale('OKLCH(0.5 0.1 200)')
      const lower = parseSeedToScale('oklch(0.5 0.1 200)')
      assert.deepEqual(upper, lower)
    })

    it('returns null for malformed oklch()', () => {
      assert.equal(parseSeedToScale('oklch()'),                null)
      assert.equal(parseSeedToScale('oklch(0.5)'),             null)
      assert.equal(parseSeedToScale('oklch(0.5 0.1)'),         null)
      assert.equal(parseSeedToScale('oklch(0.5 0.1 200 0.5)'), null) // alpha not supported
    })
  })

  // ─── Unsupported / edge cases ────────────────────────────

  describe('unsupported input', () => {
    it('returns null for empty string', () => {
      assert.equal(parseSeedToScale(''), null)
    })

    it('returns null for unsupported color formats', () => {
      assert.equal(parseSeedToScale('rgb(255, 0, 0)'),    null)
      assert.equal(parseSeedToScale('hsl(120, 50%, 50%)'), null)
      assert.equal(parseSeedToScale('red'),                null)
    })
  })
})
