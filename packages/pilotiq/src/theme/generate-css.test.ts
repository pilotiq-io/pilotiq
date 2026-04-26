import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generateThemeCSS } from './generate-css.js'
import type { ThemeMeta } from './types.js'

// Minimal-but-realistic theme meta the generator would receive from resolveTheme.
function fixture(overrides: Partial<ThemeMeta> = {}): ThemeMeta {
  return {
    light: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.15 0 0)',
      '--primary':    'oklch(0.55 0.18 250)',
    },
    dark: {
      '--background': 'oklch(0.15 0 0)',
      '--foreground': 'oklch(0.98 0 0)',
      '--primary':    'oklch(0.65 0.15 250)',
    },
    radius:      '0.625rem',
    spacing:     '0.25rem',
    iconLibrary: 'lucide',
    ...overrides,
  }
}

describe('generateThemeCSS', () => {
  // ─── Block structure ─────────────────────────────────────

  describe('block structure', () => {
    it('emits :root and .dark blocks', () => {
      const css = generateThemeCSS(fixture())
      assert.match(css, /:root \{[^}]*\}/, 'should emit :root block')
      assert.match(css, /\.dark \{[^}]*\}/, 'should emit .dark block')
    })

    it(':root contains light vars; .dark contains dark vars', () => {
      const css = generateThemeCSS(fixture())
      const rootMatch = css.match(/:root \{([\s\S]*?)\}/)
      const darkMatch = css.match(/\.dark \{([\s\S]*?)\}/)
      assert.ok(rootMatch && darkMatch)
      // Light --foreground (oklch(0.15 0 0)) lives in :root, not .dark.
      assert.match(rootMatch[1]!, /--foreground: oklch\(0\.15 0 0\)/)
      // Dark --foreground (oklch(0.98 0 0)) lives in .dark.
      assert.match(darkMatch[1]!, /--foreground: oklch\(0\.98 0 0\)/)
    })
  })

  // ─── !important flags ───────────────────────────────────

  describe('!important flags', () => {
    it('marks every emitted CSS variable as !important', () => {
      const css = generateThemeCSS(fixture())
      // Each var declaration we care about should end with `!important;`.
      const decls = css.match(/--[\w-]+:\s*[^;]+;/g) ?? []
      assert.ok(decls.length > 0, 'expected at least one var declaration')
      for (const decl of decls) {
        assert.match(decl, /!important;$/, `declaration "${decl}" should be !important`)
      }
    })
  })

  // ─── Radius + spacing always emitted ─────────────────────

  describe('radius and spacing', () => {
    it('emits --radius and --spacing inside :root', () => {
      const css = generateThemeCSS(fixture({ radius: '1rem', spacing: '0.3rem' }))
      const rootMatch = css.match(/:root \{([\s\S]*?)\}/)
      assert.ok(rootMatch)
      assert.match(rootMatch[1]!, /--radius: 1rem !important/)
      assert.match(rootMatch[1]!, /--spacing: 0\.3rem !important/)
    })
  })

  // ─── Font handling ───────────────────────────────────────

  describe('fonts', () => {
    it('omits font-family vars when fontFamily is unset', () => {
      const css = generateThemeCSS(fixture())
      assert.doesNotMatch(css, /--font-sans:/)
      assert.doesNotMatch(css, /--font-heading:/)
      assert.doesNotMatch(css, /--default-font-family:/)
      assert.doesNotMatch(css, /^html \{/m)
      assert.doesNotMatch(css, /^h1, h2, h3/m)
    })

    it('emits body-font vars and html rule when body fontFamily set', () => {
      const css = generateThemeCSS(fixture({
        fontFamily: { body: "'Inter', system-ui, sans-serif" },
      }))
      assert.match(css, /--font-sans: 'Inter', system-ui, sans-serif !important/)
      assert.match(css, /--default-font-family: 'Inter', system-ui, sans-serif !important/)
      assert.match(css, /^html \{ font-family: var\(--default-font-family\) !important; \}$/m)
    })

    it('emits heading-font var and h1-h6 rule when heading fontFamily set', () => {
      const css = generateThemeCSS(fixture({
        fontFamily: { heading: "'Playfair Display', serif" },
      }))
      assert.match(css, /--font-heading: 'Playfair Display', serif !important/)
      assert.match(css, /^h1, h2, h3, h4, h5, h6 \{ font-family: var\(--font-heading, var\(--default-font-family\)\) !important; \}$/m)
    })

    it('emits both body and heading rules together', () => {
      const css = generateThemeCSS(fixture({
        fontFamily: {
          body:    "'Inter', system-ui, sans-serif",
          heading: "'Geist', system-ui, sans-serif",
        },
      }))
      assert.match(css, /--font-sans:/)
      assert.match(css, /--font-heading:/)
      assert.match(css, /^html \{/m)
      assert.match(css, /^h1, h2, h3/m)
    })
  })

  // ─── Empty input resilience ──────────────────────────────

  describe('resilience', () => {
    it('handles empty light/dark var maps without crashing', () => {
      const css = generateThemeCSS(fixture({ light: {}, dark: {} }))
      // Still has the :root scaffolding (radius/spacing always emit).
      assert.match(css, /:root \{/)
      assert.match(css, /--radius:/)
      assert.match(css, /\.dark \{\s*\n*\}/)
    })

    it('passes through arbitrary CSS variable values unchanged (no escaping)', () => {
      // Generator does not sanitize — input is trusted (already validated upstream).
      // This test pins that contract so future "helpful" sanitization doesn't
      // silently break the cssVariables escape hatch.
      const css = generateThemeCSS(fixture({
        light: { '--custom': 'color-mix(in oklch, var(--primary) 50%, white)' },
      }))
      assert.match(css, /--custom: color-mix\(in oklch, var\(--primary\) 50%, white\) !important/)
    })
  })
})
