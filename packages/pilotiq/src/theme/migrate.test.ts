import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { migrateThemeOverrides } from './migrate.js'

/**
 * `migrateThemeOverrides` reads legacy `panelGlobal` rows on every theme
 * GET. It runs against rows persisted before the schema renames landed
 * (accentColor→themeColor, chartPalette→chartColor, preset 'default'
 * gone, baseColor sentinels dropped). A silent regression here corrupts
 * user themes on the next page load — covering it with unit tests is
 * cheap and the matrix is small.
 */
describe('migrateThemeOverrides — non-object input', () => {
  for (const bad of [null, undefined, 0, 'string', true, false] as const) {
    it(`returns {} for ${JSON.stringify(bad)}`, () => {
      assert.deepEqual(migrateThemeOverrides(bad), {})
    })
  }

  // Arrays are objects in JS but the function uses them via the same
  // key-walk; nothing should match → empty result.
  it('returns {} for an array', () => {
    assert.deepEqual(migrateThemeOverrides([1, 2, 3]), {})
  })
})

describe('migrateThemeOverrides — preset rename', () => {
  it("maps the legacy 'default' preset to 'vega'", () => {
    assert.deepEqual(migrateThemeOverrides({ preset: 'default' }), { preset: 'vega' })
  })

  it('passes other preset names through unchanged', () => {
    for (const preset of ['nova', 'maia', 'lyra', 'vega'] as const) {
      assert.deepEqual(migrateThemeOverrides({ preset }), { preset })
    }
  })

  it('ignores non-string preset values', () => {
    assert.deepEqual(migrateThemeOverrides({ preset: 42 }), {})
  })
})

describe('migrateThemeOverrides — baseColor mapping', () => {
  it("maps 'slate' to 'mist'", () => {
    assert.deepEqual(migrateThemeOverrides({ baseColor: 'slate' }), { baseColor: 'mist' })
  })

  it("drops 'cream' (Vega's bg already supplies it)", () => {
    assert.deepEqual(migrateThemeOverrides({ baseColor: 'cream' }), {})
  })

  it("drops 'default' (sentinel; no override)", () => {
    assert.deepEqual(migrateThemeOverrides({ baseColor: 'default' }), {})
  })

  it('passes other baseColor values through unchanged', () => {
    assert.deepEqual(migrateThemeOverrides({ baseColor: 'mist' }), { baseColor: 'mist' })
    assert.deepEqual(migrateThemeOverrides({ baseColor: 'taupe' }), { baseColor: 'taupe' })
  })
})

describe('migrateThemeOverrides — accentColor → themeColor', () => {
  it("'terracotta' becomes 'base' when paired with preset=vega", () => {
    const out = migrateThemeOverrides({ preset: 'default', accentColor: 'terracotta' })
    // preset: 'default' migrates to 'vega' first; the terracotta branch
    // reads the *migrated* preset, so the Vega-specific 'base' wins.
    assert.deepEqual(out, { preset: 'vega', themeColor: 'base' })
  })

  it("'terracotta' falls back to 'orange' when preset is not vega", () => {
    const out = migrateThemeOverrides({ preset: 'nova', accentColor: 'terracotta' })
    assert.deepEqual(out, { preset: 'nova', themeColor: 'orange' })
  })

  it("'terracotta' alone (no preset) falls back to 'orange'", () => {
    const out = migrateThemeOverrides({ accentColor: 'terracotta' })
    assert.deepEqual(out, { themeColor: 'orange' })
  })

  it('passes other accentColor names through as themeColor', () => {
    assert.deepEqual(migrateThemeOverrides({ accentColor: 'blue' }), { themeColor: 'blue' })
  })

  it('explicit themeColor wins over legacy accentColor', () => {
    const out = migrateThemeOverrides({ accentColor: 'blue', themeColor: 'red' })
    assert.deepEqual(out, { themeColor: 'red' })
  })
})

describe('migrateThemeOverrides — chartPalette → chartColor', () => {
  const map: Record<string, string> = {
    ocean:      'sky',
    sunset:     'orange',
    forest:     'emerald',
    berry:      'fuchsia',
    terracotta: 'base',
    default:    'base',
  }

  for (const [from, to] of Object.entries(map)) {
    it(`maps chartPalette '${from}' to chartColor '${to}'`, () => {
      assert.deepEqual(migrateThemeOverrides({ chartPalette: from }), { chartColor: to })
    })
  }

  it('passes unmapped chartPalette names through as chartColor', () => {
    assert.deepEqual(migrateThemeOverrides({ chartPalette: 'blue' }), { chartColor: 'blue' })
  })

  it('explicit chartColor wins over legacy chartPalette', () => {
    const out = migrateThemeOverrides({ chartPalette: 'ocean', chartColor: 'red' })
    assert.deepEqual(out, { chartColor: 'red' })
  })
})

describe('migrateThemeOverrides — pass-through fields', () => {
  it('forwards radius, iconLibrary, fonts, and cssVariables when shapes match', () => {
    const fonts = { heading: 'Space Grotesk', body: 'Inter' }
    const cssVariables = { '--custom-x': 'oklch(0.5 0.1 100)' }
    const out = migrateThemeOverrides({
      radius:       'large',
      iconLibrary:  'tabler',
      fonts,
      cssVariables,
    })
    assert.deepEqual(out, {
      radius:       'large',
      iconLibrary:  'tabler',
      fonts,
      cssVariables,
    })
  })

  it('drops radius/iconLibrary when they are not strings', () => {
    const out = migrateThemeOverrides({ radius: 42, iconLibrary: null })
    assert.deepEqual(out, {})
  })

  it('drops fonts/cssVariables when they are not objects', () => {
    const out = migrateThemeOverrides({ fonts: 'Inter', cssVariables: 'bad' })
    assert.deepEqual(out, {})
  })
})

describe('migrateThemeOverrides — composite migration', () => {
  it('migrates a realistic pre-rename payload end-to-end', () => {
    const legacy = {
      preset:        'default',
      baseColor:     'slate',
      accentColor:   'terracotta',
      chartPalette:  'ocean',
      radius:        'medium',
      iconLibrary:   'lucide',
      fonts:         { heading: 'Satoshi' },
    }
    const out = migrateThemeOverrides(legacy)
    assert.deepEqual(out, {
      preset:      'vega',
      baseColor:   'mist',
      themeColor:  'base',     // terracotta + preset=vega
      chartColor:  'sky',      // ocean → sky
      radius:      'medium',
      iconLibrary: 'lucide',
      fonts:       { heading: 'Satoshi' },
    })
  })

  it('a clean already-migrated payload is preserved', () => {
    const current = {
      preset:     'vega',
      baseColor:  'mist',
      themeColor: 'blue',
      chartColor: 'sky',
      radius:     'small',
    }
    assert.deepEqual(migrateThemeOverrides(current), current)
  })
})
